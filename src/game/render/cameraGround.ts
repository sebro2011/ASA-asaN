import { terrainHeight } from '../world/terrain';

/** Keep the camera and its near plane above steep terrain, including during smoothing. */
export function cameraGroundClearance(x: number, z: number, sample: (x: number, z: number) => number = terrainHeight): number {
  // Five samples bound nearby rising ground around the near-plane footprint. The
  // margin also accounts for the difference between analytic ground and its mesh.
  const radius = 0.8;
  return Math.max(
    sample(x, z), sample(x + radius, z), sample(x - radius, z),
    sample(x, z + radius), sample(x, z - radius),
  ) + 0.8;
}
