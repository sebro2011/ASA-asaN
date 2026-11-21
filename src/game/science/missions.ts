/** Simulated field exercises. Checkpoints are generated-world coordinates, not NASA sites. */
import { craterForCell } from '../world/terrain';
import type { SampleRecord } from '../state/marsGameStore';

export const MISSION_FLAGS = ['crater-rim', 'traverse-a', 'traverse-b'] as const;
export type MissionFlag = typeof MISSION_FLAGS[number];
export const TRAVERSE_WAYPOINTS = [{ x: 35, z: 0 }, { x: 65, z: -5 }] as const;
export const SURVEY_CRATER = craterForCell(0, 0);

export function updateMissionFlags(flags: readonly MissionFlag[], mode: 'foot' | 'rover', x: number, z: number): MissionFlag[] {
  const next = new Set(flags);
  if (mode === 'foot' && SURVEY_CRATER) {
    const distance = Math.hypot(x - SURVEY_CRATER.x, z - SURVEY_CRATER.z);
    if (Math.abs(distance - SURVEY_CRATER.radius) <= 6) next.add('crater-rim');
  }
  if (mode === 'rover') {
    if (Math.hypot(x - TRAVERSE_WAYPOINTS[0].x, z - TRAVERSE_WAYPOINTS[0].z) <= 10) next.add('traverse-a');
    if (next.has('traverse-a') && Math.hypot(x - TRAVERSE_WAYPOINTS[1].x, z - TRAVERSE_WAYPOINTS[1].z) <= 10) next.add('traverse-b');
  }
  return MISSION_FLAGS.filter((flag) => next.has(flag));
}

export function missionProgress(samples: readonly SampleRecord[], flags: readonly MissionFlag[]) {
  return {
    geology: Math.min(3, new Set(samples.map((sample) => sample.kind)).size),
    crater: flags.includes('crater-rim') ? 1 : 0,
    traverse: (flags.includes('traverse-a') ? 1 : 0) + (flags.includes('traverse-b') ? 1 : 0),
  };
}
