/**
 * calculateAsteroidRisk Utility
 * Keyless & deterministic algorithm calculating a 0-100% PHA Risk Score
 * based on estimated diameter (km), velocity (km/h), and miss distance (km).
 */

export function calculateAsteroidRisk(asteroid) {
  if (!asteroid) {
    return {
      riskScore: 0,
      tier: 'LOW',
      tierLabel: { en: 'Low Risk', si: 'අවම අවදානම්', ta: 'குறைந்த ஆபத்து' },
      color: '#10b981',
      glowColor: 'rgba(16, 185, 129, 0.4)',
      factors: { diameterScore: 0, velocityScore: 0, proximityScore: 0 },
      details: { diameterKm: 0, velocityKmh: 0, missDistanceKm: 0, lunarDistanceRatio: 0 }
    };
  }

  // 1. Extract Diameter in Kilometers
  let diameterKm = 0.05;
  if (typeof asteroid.estimated_diameter_km === 'number') {
    diameterKm = asteroid.estimated_diameter_km;
  } else if (typeof asteroid.estimated_diameter_km === 'object' && asteroid.estimated_diameter_km !== null) {
    diameterKm = (asteroid.estimated_diameter_km.min + asteroid.estimated_diameter_km.max) / 2;
  } else if (asteroid.minDiameterMeters && asteroid.maxDiameterMeters) {
    diameterKm = ((asteroid.minDiameterMeters + asteroid.maxDiameterMeters) / 2) / 1000;
  }

  // 2. Extract Velocity in km/h
  let velocityKmh = 45000;
  const rawVel = asteroid.velocity_kmh || asteroid.velocityKmh;
  if (rawVel) {
    velocityKmh = typeof rawVel === 'string' ? parseFloat(rawVel.replace(/,/g, '')) : rawVel;
  }

  // 3. Extract Miss Distance in Kilometers
  let missDistanceKm = 3500000;
  const rawDist = asteroid.miss_distance_km || asteroid.missDistanceKm;
  if (rawDist) {
    missDistanceKm = typeof rawDist === 'string' ? parseFloat(rawDist.replace(/,/g, '')) : rawDist;
  }

  const isExplicitHazard = Boolean(asteroid.is_potentially_hazardous_asteroid || asteroid.isHazardous);

  // Factor 1: Diameter Factor (Max 40 points)
  let diameterScore = 0;
  if (diameterKm >= 1.0) {
    diameterScore = 40;
  } else if (diameterKm >= 0.3) {
    diameterScore = 25 + ((diameterKm - 0.3) / 0.7) * 15;
  } else if (diameterKm >= 0.14) {
    diameterScore = 15 + ((diameterKm - 0.14) / 0.16) * 10;
  } else {
    diameterScore = (diameterKm / 0.14) * 15;
  }

  // Factor 2: Velocity Factor (Max 30 points)
  let velocityScore = 0;
  if (velocityKmh >= 100000) {
    velocityScore = 30;
  } else if (velocityKmh <= 20000) {
    velocityScore = 5;
  } else {
    velocityScore = 5 + ((velocityKmh - 20000) / 80000) * 25;
  }

  // Factor 3: Proximity / Miss Distance Factor (Max 30 points)
  let proximityScore = 0;
  if (missDistanceKm <= 384400) {
    proximityScore = 30;
  } else if (missDistanceKm <= 1500000) {
    proximityScore = 20 + ((1500000 - missDistanceKm) / (1500000 - 384400)) * 10;
  } else if (missDistanceKm <= 7500000) {
    proximityScore = 8 + ((7500000 - missDistanceKm) / (7500000 - 1500000)) * 12;
  } else {
    proximityScore = Math.max(1, 8 - (missDistanceKm / 20000000) * 7);
  }

  let totalScore = Math.round(diameterScore + velocityScore + proximityScore);
  if (isExplicitHazard && totalScore < 45) {
    totalScore = 52;
  }

  totalScore = Math.min(100, Math.max(2, totalScore));

  let tier = 'LOW';
  let tierLabel = { en: 'Low Risk', si: 'අවම අවදානම්', ta: 'குறைந்த ஆபத்து' };
  let color = '#10b981';
  let glowColor = 'rgba(16, 185, 129, 0.4)';

  if (totalScore >= 70) {
    tier = 'CRITICAL';
    tierLabel = { en: 'Critical Risk 🔴', si: 'අධි අවදානම් 🔴', ta: 'அதிக ஆபத்து 🔴' };
    color = '#f43f5e';
    glowColor = 'rgba(244, 63, 94, 0.5)';
  } else if (totalScore >= 40) {
    tier = 'MODERATE';
    tierLabel = { en: 'Moderate Risk 🟡', si: 'මධ්‍යස්ථ අවදානම් 🟡', ta: 'மிதமான ஆபத்து 🟡' };
    color = '#f59e0b';
    glowColor = 'rgba(245, 158, 11, 0.4)';
  }

  return {
    riskScore: totalScore,
    tier,
    tierLabel,
    color,
    glowColor,
    factors: {
      diameterScore: Math.round(diameterScore),
      velocityScore: Math.round(velocityScore),
      proximityScore: Math.round(proximityScore)
    },
    details: {
      diameterKm: parseFloat(diameterKm.toFixed(3)),
      velocityKmh: Math.round(velocityKmh),
      missDistanceKm: Math.round(missDistanceKm),
      lunarDistanceRatio: parseFloat((missDistanceKm / 384400).toFixed(1))
    }
  };
}

export default calculateAsteroidRisk;
