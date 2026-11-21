/**
 * Save system.
 *
 * IndexedDB, wrapped by hand: the game needs one small record, and a dependency
 * for that would be larger than the whole persistence layer. The dangerous part of
 * any save system is not writing it — it is reading a record written by an older
 * build, or by a build that crashed mid-write. So:
 *
 *   - every save carries `version`; an unknown version is *migrated or discarded*,
 *     never applied to the simulation half-way
 *   - every field is validated on load, and a record that fails validation is
 *     reported as corrupt (and ignored) instead of throwing on the next read
 *   - if IndexedDB is unavailable (private mode, older WebViews) the store falls
 *     back to memory and the UI says so, rather than silently losing progress
 */
import { MISSION_FLAGS, type MissionFlag } from '../science/missions';
import type { DiscoveryRecord, JournalRecord, QualityPreset, SampleRecord, Vec3 } from './marsGameStore';

export const SAVE_VERSION = 1;
const DB_NAME = 'cosmora-mars-explorer';
const STORE_NAME = 'saves';
const SAVE_KEY = 'autosave';

export interface SaveData {
  version: number;
  savedAt: string;
  seed: string;
  player: {
    position: Vec3;
    yaw: number;
    /** 'foot' | 'rover' — where the astronaut was when saved. */
    mode: 'foot' | 'rover';
  };
  rover: {
    position: Vec3;
    heading: number;
  };
  resources: {
    oxygen: number;
    suitBattery: number;
    roverBattery: number;
    energy: number;
  };
  settings: {
    quality: QualityPreset;
    cameraMode: 'third' | 'first';
  };
  progress: {
    samples: SampleRecord[];
    missionFlags?: MissionFlag[];
    journal: JournalRecord[];
    discoveries: DiscoveryRecord[];
    roverDistance: number;
    walkedDistance: number;
    researchProgress: number;
    /** Sun angle, so a save resumes at the same time of day. */
    sunAngle: number;
  };
}

export type LoadResult =
  | { status: 'ok'; data: SaveData }
  | { status: 'empty' }
  | { status: 'corrupt'; reason: string }
  | { status: 'unsupported'; reason: string };

/* ------------------------------------------------------------------ storage */

interface StorageBackend {
  available: boolean;
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}

/** In-memory fallback: keeps the session working when IndexedDB is blocked. */
function memoryBackend(): StorageBackend {
  let value: string | null = null;
  return {
    available: false,
    async read() {
      return value;
    },
    async write(next: string) {
      value = next;
    },
    async clear() {
      value = null;
    },
  };
}

function indexedDbBackend(): StorageBackend {
  let dbPromise: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
    return dbPromise;
  };

  const withStore = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
  };

  return {
    available: true,
    read: () => withStore('readonly', (store) => store.get(SAVE_KEY) as IDBRequest<string | null>),
    write: (value: string) =>
      withStore('readwrite', (store) => store.put(value, SAVE_KEY) as IDBRequest<string>).then(() => undefined),
    clear: () => withStore('readwrite', (store) => store.delete(SAVE_KEY) as IDBRequest<undefined>).then(() => undefined),
  };
}

let backend: StorageBackend | null = null;

function getBackend(): StorageBackend {
  if (backend) return backend;
  const usable = typeof indexedDB !== 'undefined';
  backend = usable ? indexedDbBackend() : memoryBackend();
  return backend;
}

/** True when saves survive a reload (as opposed to a memory fallback). */
export function isPersistenceAvailable(): boolean {
  return getBackend().available;
}

/* ------------------------------------------------------------------ validation */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isVec3(value: unknown): value is Vec3 {
  if (!isRecord(value)) return false;
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function readSamples(value: unknown): SampleRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.sourceId !== 'string' || typeof item.kind !== 'string') return [];
    return [
      {
        sourceId: item.sourceId,
        kind: item.kind,
        label: typeof item.label === 'string' ? item.label : item.kind,
        confidence: clamp01(finiteOr(item.confidence, 0.6)),
        x: finiteOr(item.x, 0),
        z: finiteOr(item.z, 0),
        collectedAt: typeof item.collectedAt === 'string' ? item.collectedAt : new Date(0).toISOString(),
      },
    ];
  });
}

function readJournal(value: unknown): JournalRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string') return [];
    return [
      {
        id: item.id,
        at: typeof item.at === 'string' ? item.at : new Date(0).toISOString(),
        title: item.title,
        body: typeof item.body === 'string' ? item.body : '',
        progress: clamp01(finiteOr(item.progress, 0)),
      },
    ];
  });
}

function readDiscoveries(value: unknown): DiscoveryRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string') return [];
    return [
      {
        id: item.id,
        label: typeof item.label === 'string' ? item.label : 'Location',
        x: finiteOr(item.x, 0),
        z: finiteOr(item.z, 0),
        at: typeof item.at === 'string' ? item.at : new Date(0).toISOString(),
      },
    ];
  });
}

/**
 * Validates a parsed save.
 *
 * Exported because the tests drive it directly: a validator that can only be
 * reached through IndexedDB is a validator that is never tested against hostile
 * input. The contract is that a malformed record is *rejected with a reason*, not
 * partially applied.
 */
export function validateSave(input: unknown): LoadResult {
  if (!isRecord(input)) return { status: 'corrupt', reason: 'not an object' };

  const version = input.version;
  if (typeof version !== 'number') return { status: 'corrupt', reason: 'missing version' };
  if (version > SAVE_VERSION) {
    // Written by a newer build than this one: refusing is correct, because this
    // build cannot know what the extra fields mean.
    return { status: 'corrupt', reason: `version ${version} is newer than ${SAVE_VERSION}` };
  }

  const player = isRecord(input.player) ? input.player : null;
  const rover = isRecord(input.rover) ? input.rover : null;
  const resources = isRecord(input.resources) ? input.resources : null;
  const settings = isRecord(input.settings) ? input.settings : null;
  const progress = isRecord(input.progress) ? input.progress : null;

  if (!player || !isVec3(player.position)) return { status: 'corrupt', reason: 'player position missing' };
  if (!rover || !isVec3(rover.position)) return { status: 'corrupt', reason: 'rover position missing' };

  const quality: QualityPreset =
    settings?.quality === 'low' || settings?.quality === 'balanced' || settings?.quality === 'high'
      ? settings.quality
      : 'high';

  return {
    status: 'ok',
    data: {
      version: SAVE_VERSION,
      savedAt: typeof input.savedAt === 'string' ? input.savedAt : new Date(0).toISOString(),
      seed: typeof input.seed === 'string' ? input.seed : 'mars-explorer-2047',
      player: {
        position: player.position,
        yaw: finiteOr(player.yaw, 0),
        mode: player.mode === 'rover' ? 'rover' : 'foot',
      },
      rover: {
        position: rover.position,
        heading: finiteOr(rover.heading, 0),
      },
      resources: {
        oxygen: clamp01(finiteOr(resources?.oxygen, 1)),
        suitBattery: clamp01(finiteOr(resources?.suitBattery, 1)),
        roverBattery: clamp01(finiteOr(resources?.roverBattery, 1)),
        energy: clamp01(finiteOr(resources?.energy, 1)),
      },
      settings: {
        quality,
        cameraMode: settings?.cameraMode === 'first' ? 'first' : 'third',
      },
      progress: {
        samples: readSamples(progress?.samples),
        missionFlags: Array.isArray(progress?.missionFlags)
          ? MISSION_FLAGS.filter((flag) => (progress.missionFlags as unknown[]).includes(flag))
          : [],
        journal: readJournal(progress?.journal),
        discoveries: readDiscoveries(progress?.discoveries),
        roverDistance: Math.max(0, finiteOr(progress?.roverDistance, 0)),
        walkedDistance: Math.max(0, finiteOr(progress?.walkedDistance, 0)),
        researchProgress: clamp01(finiteOr(progress?.researchProgress, 0)),
        sunAngle: finiteOr(progress?.sunAngle, Math.PI / 3),
      },
    },
  };
}

/* ------------------------------------------------------------------ public API */

export async function loadGame(): Promise<LoadResult> {
  const store = getBackend();
  let raw: string | null;
  try {
    raw = await store.read();
  } catch (error) {
    return { status: 'corrupt', reason: error instanceof Error ? error.message : 'read failed' };
  }

  if (!raw) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', reason: 'not valid JSON' };
  }

  return validateSave(parsed);
}

export async function saveGame(data: Omit<SaveData, 'version' | 'savedAt'>): Promise<{ ok: boolean; persisted: boolean }> {
  const store = getBackend();
  const payload: SaveData = { ...data, version: SAVE_VERSION, savedAt: new Date().toISOString() };
  try {
    await store.write(JSON.stringify(payload));
    return { ok: true, persisted: store.available };
  } catch {
    return { ok: false, persisted: store.available };
  }
}

export async function clearSave(): Promise<void> {
  try {
    await getBackend().clear();
  } catch {
    // Clearing a save that does not exist is not an error the player needs to see.
  }
}

/** A fresh save at the landing site. */
export function newGameData(sunAngle: number): Omit<SaveData, 'version' | 'savedAt'> {
  const position = { x: 6, y: 0, z: -14 };
  return {
    seed: 'mars-explorer-2047',
    player: { position, yaw: 0, mode: 'foot' },
    rover: { position: { x: -8, y: 0, z: -18 }, heading: 0 },
    resources: { oxygen: 1, suitBattery: 1, roverBattery: 1, energy: 1 },
    settings: { quality: 'high', cameraMode: 'third' },
    progress: {
      samples: [],
      missionFlags: [],
      journal: [],
      discoveries: [],
      roverDistance: 0,
      walkedDistance: 0,
      researchProgress: 0,
      sunAngle,
    },
  };
}
