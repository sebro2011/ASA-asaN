/**
 * Deterministic Asteroid Hazard Risk Score Engine
 * Computes risk percentage (0–100%) from NASA NeoWs API payload
 * 
 * Formula:
 * - Diameter Factor (40% weight)
 * - Velocity Factor (30% weight)
 * - Miss Distance Factor (30% weight)
 */

export function calculateAsteroidRisk(asteroid = {}) {
  // 1. Extract or estimate diameter in km
  let diameterKm = 0.05;
  if (asteroid.estimated_diameter?.kilometers) {
    const minD = asteroid.estimated_diameter.kilometers.estimated_diameter_min || 0.03;
    const maxD = asteroid.estimated_diameter.kilometers.estimated_diameter_max || 0.08;
    diameterKm = (minD + maxD) / 2;
  } else if (typeof asteroid.estimated_diameter_km === 'number') {
    diameterKm = asteroid.estimated_diameter_km;
  } else if (typeof asteroid.diameter_m === 'number') {
    diameterKm = asteroid.diameter_m / 1000;
  }

  // 2. Extract relative velocity in km/h
  let velocityKmh = 45000;
  const closeApproach = asteroid.close_approach_data?.[0];
  if (closeApproach?.relative_velocity?.kilometers_per_hour) {
    velocityKmh = parseFloat(closeApproach.relative_velocity.kilometers_per_hour) || 45000;
  } else if (typeof asteroid.relative_velocity_kmh === 'number') {
    velocityKmh = asteroid.relative_velocity_kmh;
  } else if (typeof asteroid.velocity_kms === 'number') {
    velocityKmh = asteroid.velocity_kms * 3600;
  }

  // 3. Extract miss distance in km
  let missDistanceKm = 5000000;
  if (closeApproach?.miss_distance?.kilometers) {
    missDistanceKm = parseFloat(closeApproach.miss_distance.kilometers) || 5000000;
  } else if (typeof asteroid.miss_distance_km === 'number') {
    missDistanceKm = asteroid.miss_distance_km;
  } else if (typeof asteroid.miss_distance_ld === 'number') {
    missDistanceKm = asteroid.miss_distance_ld * 384400; // 1 Lunar Distance
  }

  const isHazardousFlag = Boolean(
    asteroid.is_potentially_hazardous_asteroid || asteroid.is_hazardous
  );

  // --- Sub-score calculations (normalized 0 to 100) ---

  // Diameter score: 0.02 km -> 10 pts, 0.14 km (PHA threshold) -> 50 pts, >= 1.0 km -> 100 pts
  let diameterScore = Math.min(100, Math.max(5, (diameterKm / 0.8) * 100));

  // Velocity score: 20,000 km/h -> 20 pts, 60,000 km/h -> 60 pts, >= 100,000 km/h -> 100 pts
  let velocityScore = Math.min(100, Math.max(10, (velocityKmh / 100000) * 100));

  // Miss distance score (inverse - closer is higher risk):
  // < 384,400 km (1 Lunar Distance) -> 100 pts
  // 7,500,000 km (PHA threshold) -> 35 pts
  // > 20,000,000 km -> 5 pts
  let distanceScore = 100;
  if (missDistanceKm > 384400) {
    const ratio = (missDistanceKm - 384400) / (20000000 - 384400);
    distanceScore = Math.max(5, Math.min(95, 100 - ratio * 95));
  }

  // --- Weighted Total Calculation ---
  // Diameter (40%), Velocity (30%), Miss Distance (30%)
  let totalScore = Math.round(
    diameterScore * 0.40 + 
    velocityScore * 0.30 + 
    distanceScore * 0.30
  );

  // Bonus weight if officially classified by NASA JPL as Potentially Hazardous Asteroid
  if (isHazardousFlag && totalScore < 45) {
    totalScore = 45;
  }

  // Cap between 1 and 99 unless direct impact
  totalScore = Math.max(1, Math.min(99, totalScore));

  // Risk categorization
  let level = 'Low Risk';
  let levelColor = 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
  let badgeColor = '#10b981';
  let statusText = 'Nominal planetary clearance. Safe orbital pass.';

  if (totalScore >= 70) {
    level = 'Critical Risk';
    levelColor = 'text-rose-400 border-rose-500/40 bg-rose-500/10';
    badgeColor = '#f43f5e';
    statusText = 'High planetary surveillance priority. Close approach.';
  } else if (totalScore >= 40) {
    level = 'Moderate Risk';
    levelColor = 'text-amber-400 border-amber-500/40 bg-amber-500/10';
    badgeColor = '#f59e0b';
    statusText = 'Monitored trajectory. Moderate planetary defense interest.';
  }

  return {
    score: totalScore,
    level,
    levelColor,
    badgeColor,
    statusText,
    diameterKm: parseFloat(diameterKm.toFixed(3)),
    velocityKmh: Math.round(velocityKmh),
    missDistanceKm: Math.round(missDistanceKm),
    missDistanceLd: parseFloat((missDistanceKm / 384400).toFixed(2)),
    diameterScore: Math.round(diameterScore),
    velocityScore: Math.round(velocityScore),
    distanceScore: Math.round(distanceScore),
    isHazardous: isHazardousFlag
  };
}
