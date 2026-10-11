/** Small geographic helpers shared by the Earth Intelligence Lab. */

export function validateCoordinates(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** Square study-area bounding box around a point, in degrees. `[south, west, north, east]` */
export function boundingBoxAround(latitude: number, longitude: number, spanDegrees = 1.2): [number, number, number, number] {
  const half = Math.abs(spanDegrees) / 2;
  const south = Math.max(-90, latitude - half);
  const north = Math.min(90, latitude + half);
  const west = Math.max(-180, longitude - half);
  const east = Math.min(180, longitude + half);
  return [south, west, north, east];
}

export function boundingBoxCenter(bounds: [number, number, number, number]): [number, number] {
  const [south, west, north, east] = bounds;
  return [(south + north) / 2, (west + east) / 2];
}

export function isValidBoundingBox(bounds: unknown): bounds is [number, number, number, number] {
  return (
    Array.isArray(bounds) &&
    bounds.length === 4 &&
    bounds.every((value) => typeof value === 'number' && Number.isFinite(value)) &&
    bounds[2] > bounds[0] &&
    bounds[3] > bounds[1]
  );
}
