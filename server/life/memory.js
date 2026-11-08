/**
 * Unified Memory Fabric — working, episodic, semantic, procedural and personal.
 *
 * Retrieval is layered, and each layer is optional:
 *   1. FTS5 keyword search (BM25) when the SQLite build has it;
 *   2. a deterministic token-overlap score when it does not;
 *   3. glossary-based cross-language expansion (si ↔ ta ↔ en);
 *   4. cosine similarity over embeddings, only when an embedding adapter
 *      returned one for both the query and the memory.
 *
 * The ranking is a fixed, documented blend rather than a model's opinion, so a
 * result can be explained ("keyword 0.42, recency 0.18, …") in the Memory Center.
 */
import { detectLanguage, expandQueryTerms, normalizeText, tokenize } from './language.js';
import { LifeError } from './modelFabric.js';
import { containsSecret } from './security.js';
import { nowIso, randomId } from './store.js';

export const MEMORY_CATEGORIES = ['working', 'episodic', 'semantic', 'procedural', 'personal'];

/** Default retention, in days. `null` means "keep until the user deletes it". */
export const RETENTION_DAYS = {
  working: 7,
  episodic: 180,
  semantic: null,
  procedural: null,
  personal: null,
};

const MAX_BODY = 20_000;
const MAX_TITLE = 160;
const MAX_TAGS = 12;

const WEIGHTS = { keyword: 0.45, recency: 0.2, confidence: 0.15, pinned: 0.1, vector: 0.1 };

export function createMemoryService({ store, security, fabric = null, clock = () => new Date(), userId = 'local' } = {}) {
  if (!store || !security) throw new Error('memory service needs a store and a security kernel');

  const now = () => nowIso(clock);

  const expire = () => {
    const stamp = now();
    const expired = store.queryAll(
      'select id from memories where user_id = ? and expires_at is not null and expires_at <= ?',
      [userId, stamp],
    );
    if (expired.length === 0) return { removed: 0 };
    store.tx(() => {
      for (const row of expired) {
        writeVersion(row.id, 'expired', 'retention policy');
        store.run('delete from memories where id = ? and user_id = ?', [row.id, userId]);
      }
    });
    security.audit('memory.expired', { detail: { removed: expired.length } });
    return { removed: expired.length };
  };

  function writeVersion(memoryId, reason, changedBy = 'local') {
    const memory = store.queryOne('select * from memories where id = ? and user_id = ?', [memoryId, userId]);
    if (!memory) return;
    store.run(
      `insert into memory_versions (id, memory_id, version, title, body, tags, changed_at, changed_by, reason)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomId('mv'), memory.id, memory.version, memory.title, memory.body, memory.tags, now(), changedBy, reason],
    );
  }

  const validate = ({ title, body }) => {
    const cleanTitle = normalizeText(title);
    const cleanBody = normalizeText(body);
    if (cleanTitle.length < 3 || cleanTitle.length > MAX_TITLE) {
      throw new LifeError('INVALID_MEMORY_TITLE', `A memory title must be 3–${MAX_TITLE} characters.`, { status: 400 });
    }
    if (cleanBody.length === 0 || cleanBody.length > MAX_BODY) {
      throw new LifeError('INVALID_MEMORY_BODY', `A memory body must be 1–${MAX_BODY} characters.`, { status: 400 });
    }
    if (containsSecret(`${cleanTitle}\n${cleanBody}`)) {
      throw new LifeError(
        'SECRET_IN_MEMORY',
        'That text looks like it contains a credential. Memory never stores keys, tokens or passwords.',
        { status: 422 },
      );
    }
    return { title: cleanTitle, body: cleanBody };
  };

  const similar = (body, category) => {
    const tokens = new Set(tokenize(body));
    if (tokens.size < 8) return null;
    const candidates = store.queryAll(
      'select id, title, body from memories where user_id = ? and category = ? order by updated_at desc limit 200',
      [userId, category],
    );
    for (const candidate of candidates) {
      const other = new Set(tokenize(candidate.body));
      const intersection = [...tokens].filter((token) => other.has(token)).length;
      const union = new Set([...tokens, ...other]).size;
      // Jaccard ≥ 0.8 with at least eight tokens in common is a near-duplicate;
      // short notes are exempt because a small vocabulary makes the ratio noisy.
      if (union > 0 && intersection >= 8 && intersection / union >= 0.8) return candidate;
    }
    return null;
  };

  const add = (input = {}) => {
    security.require('memory.write');
    const category = String(input.category || 'semantic');
    if (!MEMORY_CATEGORIES.includes(category)) {
      throw new LifeError('INVALID_CATEGORY', `Unknown memory category: ${category}`, { status: 400 });
    }
    const { title, body } = validate(input);
    const tags = sanitiseTags(input.tags);
    const language = input.language || detectLanguage(body).language;

    const duplicateTitle = store.queryOne(
      'select * from memories where user_id = ? and category = ? and lower(title) = lower(?)',
      [userId, category, title],
    );
    if (duplicateTitle) {
      return { memory: hydrate(duplicateTitle), duplicate: true, reason: 'same-title' };
    }
    const nearDuplicate = similar(body, category);
    if (nearDuplicate) {
      return { memory: hydrate(nearDuplicate), duplicate: true, reason: 'similar-body' };
    }

    const id = randomId('mem');
    const stamp = now();
    const expiresAt = input.expiresAt ?? defaultExpiry(category, clock());
    const record = {
      id,
      user_id: userId,
      category,
      title,
      body,
      language: ['en', 'si', 'ta'].includes(language) ? language : 'und',
      tags: JSON.stringify(tags),
      source: String(input.source || 'manual').slice(0, 40),
      visibility: ['private', 'task', 'shared'].includes(input.visibility) ? input.visibility : 'private',
      confidence: clamp(Number(input.confidence ?? 1)),
      pinned: input.pinned ? 1 : 0,
      version: 1,
      embedding: input.embedding ? JSON.stringify(input.embedding) : null,
      created_at: stamp,
      updated_at: stamp,
      expires_at: expiresAt,
    };
    store.run(
      `insert into memories (id, user_id, category, title, body, language, tags, source, visibility,
        confidence, pinned, version, embedding, created_at, updated_at, expires_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.user_id,
        record.category,
        record.title,
        record.body,
        record.language,
        record.tags,
        record.source,
        record.visibility,
        record.confidence,
        record.pinned,
        record.version,
        record.embedding,
        record.created_at,
        record.updated_at,
        record.expires_at,
      ],
    );
    security.audit('memory.created', { subject: record.id, detail: { category, language } });
    return { memory: hydrate(record), duplicate: false, reason: null };
  };

  const update = (id, patch = {}, { reason = 'user edit' } = {}) => {
    security.require('memory.write');
    const existing = store.queryOne('select * from memories where id = ? and user_id = ?', [id, userId]);
    if (!existing) throw new LifeError('MEMORY_NOT_FOUND', 'No such memory.', { status: 404 });
    const { title, body } = validate({
      title: patch.title ?? existing.title,
      body: patch.body ?? existing.body,
    });
    const tags = patch.tags ? sanitiseTags(patch.tags) : safeArray(existing.tags);
    const embedding = patch.body ? null : existing.embedding;

    return store.tx(() => {
      writeVersion(id, reason);
      store.run(
        `update memories set title = ?, body = ?, tags = ?, language = ?, confidence = ?, pinned = ?,
           visibility = ?, embedding = ?, version = version + 1, updated_at = ?, expires_at = ?
         where id = ? and user_id = ?`,
        [
          title,
          body,
          JSON.stringify(tags),
          patch.language ?? detectLanguage(body).language,
          patch.confidence === undefined ? existing.confidence : clamp(Number(patch.confidence)),
          (patch.pinned === undefined ? existing.pinned : patch.pinned ? 1 : 0),
          ['private', 'task', 'shared'].includes(patch.visibility) ? patch.visibility : existing.visibility,
          embedding,
          now(),
          patch.expiresAt === undefined ? existing.expires_at : patch.expiresAt,
          id,
          userId,
        ],
      );
      const updated = store.queryOne('select * from memories where id = ?', [id]);
      security.audit('memory.updated', { subject: id, detail: { reason } });
      return hydrate(updated);
    });
  };

  const correct = (id, { body, title, reason }) =>
    update(id, { body, title }, { reason: reason || 'correction' });

  const remove = (id) => {
    security.require('memory.delete');
    const existing = store.queryOne('select id from memories where id = ? and user_id = ?', [id, userId]);
    if (!existing) throw new LifeError('MEMORY_NOT_FOUND', 'No such memory.', { status: 404 });
    store.tx(() => {
      writeVersion(id, 'deleted', 'deletion');
      store.run('delete from memories where id = ? and user_id = ?', [id, userId]);
      store.run('delete from memory_links where user_id = ? and ((from_type = ? and from_id = ?) or (to_type = ? and to_id = ?))', [
        userId,
        'memory',
        id,
        'memory',
        id,
      ]);
    });
    security.audit('memory.deleted', { severity: 'warning', subject: id });
    return { deleted: true, id };
  };

  const get = (id) => {
    security.require('memory.read');
    const row = store.queryOne('select * from memories where id = ? and user_id = ?', [id, userId]);
    if (!row) throw new LifeError('MEMORY_NOT_FOUND', 'No such memory.', { status: 404 });
    return hydrate(row);
  };

  const list = ({ category = null, limit = 50, offset = 0 } = {}) => {
    security.require('memory.read');
    const params = [userId];
    let sql = 'select * from memories where user_id = ?';
    if (category) {
      sql += ' and category = ?';
      params.push(category);
    }
    sql += ' order by pinned desc, updated_at desc limit ? offset ?';
    params.push(Math.min(Number(limit) || 50, 200), Math.max(0, Number(offset) || 0));
    return store.queryAll(sql, params).map(hydrate);
  };

  const counts = () => {
    security.require('memory.read');
    const rows = store.queryAll('select category, count(*) as count from memories where user_id = ? group by category', [
      userId,
    ]);
    const byCategory = Object.fromEntries(MEMORY_CATEGORIES.map((category) => [category, 0]));
    for (const row of rows) byCategory[row.category] = row.count;
    return { total: rows.reduce((sum, row) => sum + row.count, 0), byCategory };
  };

  /** Search with an explainable score. `query` may be in any of the three languages. */
  const search = async ({ query = '', categories = null, limit = 10, now: at = clock() } = {}) => {
    security.require('memory.read');
    const clean = normalizeText(query);
    if (!clean) return { results: [], query: clean, strategy: 'empty' };
    const wanted = Array.isArray(categories) && categories.length > 0 ? categories.filter((entry) => MEMORY_CATEGORIES.includes(entry)) : MEMORY_CATEGORIES;
    const placeholders = wanted.map(() => '?').join(',');
    const expanded = expandQueryTerms(clean);
    const scored = new Map();

    if (store.hasFts && expanded.length > 0) {
      const match = expanded
        .map((term) => term.replace(/["*]/g, '').trim())
        .filter(Boolean)
        .map((term) => `"${term}"`)
        .join(' OR ');
      if (match) {
        try {
          const rows = store.queryAll(
            `select m.*, bm25(memories_fts) as rank from memories_fts
             join memories m on m.rowid = memories_fts.rowid
             where memories_fts match ? and m.user_id = ? and m.category in (${placeholders})
             order by rank limit ?`,
            [match, userId, ...wanted, Math.max(limit * 4, 20)],
          );
          const worst = Math.min(...rows.map((row) => row.rank), 0);
          const best = Math.max(...rows.map((row) => row.rank), worst - 1);
          for (const row of rows) {
            // bm25 returns lower-is-better negative numbers; normalise to 0..1.
            const keyword = best === worst ? 1 : (row.rank - worst) / (best - worst);
            scored.set(row.id, { row, keyword: 0.4 + 0.6 * keyword, reason: 'fts' });
          }
        } catch {
          /* fall through to token scoring */
        }
      }
    }

    if (scored.size === 0) {
      const rows = store.queryAll(
        `select * from memories where user_id = ? and category in (${placeholders}) order by updated_at desc limit 400`,
        [userId, ...wanted],
      );
      const queryTokens = new Set(tokenize(clean));
      for (const row of rows) {
        const tokens = new Set(tokenize(`${row.title} ${row.body} ${row.tags}`));
        const hits = [...queryTokens].filter((token) => tokens.has(token)).length;
        let score = queryTokens.size === 0 ? 0 : hits / queryTokens.size;
        // Glossary expansion: a Sinhala query may match an English memory.
        for (const term of expanded.slice(1)) {
          if (`${row.title} ${row.body}`.toLowerCase().includes(term.toLowerCase())) score += 0.15;
        }
        if (score > 0) scored.set(row.id, { row, keyword: Math.min(score, 1), reason: 'tokens' });
      }
    }

    let queryEmbedding = null;
    if (fabric && fabric.embed) {
      try {
        queryEmbedding = await fabric.embed(clean);
      } catch {
        queryEmbedding = null;
      }
    }

    const results = [];
    for (const { row, keyword, reason } of scored.values()) {
      const memory = hydrate(row);
      const recency = recencyScore(row.updated_at, at);
      const vector = queryEmbedding && memory.embedding ? cosine(queryEmbedding, memory.embedding) : null;
      const score =
        WEIGHTS.keyword * keyword +
        WEIGHTS.recency * recency +
        WEIGHTS.confidence * memory.confidence +
        WEIGHTS.pinned * (memory.pinned ? 1 : 0) +
        WEIGHTS.vector * (vector ?? 0);
      results.push({
        memory,
        score: Number(score.toFixed(4)),
        reason,
        parts: {
          keyword: Number(keyword.toFixed(3)),
          recency: Number(recency.toFixed(3)),
          confidence: memory.confidence,
          pinned: memory.pinned ? 1 : 0,
          vector: vector === null ? null : Number(vector.toFixed(3)),
        },
      });
    }

    results.sort((a, b) => b.score - a.score || Date.parse(b.memory.updatedAt) - Date.parse(a.memory.updatedAt));
    return {
      query: clean,
      expandedTerms: expanded.slice(1),
      strategy: queryEmbedding ? 'fts+vector' : store.hasFts ? 'fts' : 'tokens',
      results: results.slice(0, Math.min(Number(limit) || 10, 50)),
    };
  };

  /** Deterministic extractive summary: no model call, no invented content. */
  const summarize = ({ category = null, limit = 20 } = {}) => {
    security.require('memory.read');
    const rows = list({ category, limit });
    if (rows.length === 0) return { summary: '', used: [], method: 'extractive' };
    const sentences = [];
    for (const memory of rows) {
      const first = memory.body.split(/(?<=[.!?。])\s+/u)[0] || memory.body;
      sentences.push(`${memory.title}: ${first.slice(0, 200)}`);
    }
    return {
      summary: sentences.slice(0, 8).join('\n'),
      used: rows.slice(0, 8).map((memory) => memory.id),
      method: 'extractive',
    };
  };

  const listVersions = (id) => {
    security.require('memory.read');
    return store
      .queryAll(
        'select id, version, title, body, changed_at, changed_by, reason from memory_versions where memory_id = ? order by version desc',
        [id],
      )
      .map((row) => ({
        id: row.id,
        version: row.version,
        title: row.title,
        body: row.body,
        changedAt: row.changed_at,
        changedBy: row.changed_by,
        reason: row.reason,
      }));
  };

  const revert = (id, version) => {
    security.require('memory.write');
    const target = store.queryOne('select * from memory_versions where memory_id = ? and version = ?', [id, Number(version)]);
    if (!target) throw new LifeError('VERSION_NOT_FOUND', 'No such memory version.', { status: 404 });
    return update(id, { title: target.title, body: target.body }, { reason: `revert to v${version}` });
  };

  const permissions = () => security.listGrants().filter((entry) => entry.id.startsWith('memory.'));

  return {
    categories: MEMORY_CATEGORIES,
    retention: RETENTION_DAYS,
    add,
    update,
    correct,
    remove,
    get,
    list,
    counts,
    search,
    summarize,
    listVersions,
    revert,
    expire,
    permissions,
    weights: WEIGHTS,
  };
}

/* ---------------------------------------------------------------- helpers */

function hydrate(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    language: row.language,
    tags: safeArray(row.tags),
    source: row.source,
    visibility: row.visibility,
    confidence: row.confidence,
    pinned: row.pinned === 1,
    version: row.version,
    embedding: row.embedding ? safeArray(row.embedding) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

function defaultExpiry(category, at) {
  const days = RETENTION_DAYS[category];
  if (!days) return null;
  return new Date(at.getTime() + days * 86_400_000).toISOString();
}

function recencyScore(updatedAt, at) {
  const ageDays = Math.max(0, (at.getTime() - Date.parse(updatedAt)) / 86_400_000);
  // Half-life of 30 days: today scores 1, a month old scores 0.5.
  return Math.pow(0.5, ageDays / 30);
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    na += a[index] ** 2;
    nb += b[index] ** 2;
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function sanitiseTags(tags) {
  if (!tags) return [];
  const list = Array.isArray(tags) ? tags : String(tags).split(',');
  return [...new Set(list.map((tag) => normalizeText(String(tag)).slice(0, 32)).filter(Boolean))].slice(0, MAX_TAGS);
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clamp(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}
