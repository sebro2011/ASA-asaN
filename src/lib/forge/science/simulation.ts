/**
 * Simulation lab — small, validated numerical models.
 *
 * Rules encoded here:
 *  - every model prints its governing equations, numerical method, units and
 *    assumptions, because a simulation without them is just a curve;
 *  - every model is *validated against an independent solution* in the test
 *    suite (analytic result, conservation law, or a known invariant), and the
 *    run itself reports the validation diagnostic it can compute;
 *  - a simulation is a model prediction. It is never presented as an observation.
 *
 * Nothing in this file knows about the network, the DOM or an AI provider.
 */

import {
  ScienceInputError,
  assertFinite,
  buildReproducibility,
  type ComputationResult,
} from './contracts';

export interface SimulationSeries {
  /** Sample times / steps, in `timeUnit`. */
  t: number[];
  /** Primary state, in `stateUnit`. */
  y: number[];
  /** Secondary state for 2-D systems (velocity, or the second component). */
  v?: number[];
}

export interface SimulationOutput {
  series: SimulationSeries;
  /** Diagnostics that let a reader judge the run, not just look at it. */
  diagnostics: Record<string, number | string | boolean | null>;
  /** Independent check performed inside the run, when one exists. */
  validation: { name: string; expected: number; observed: number; relativeError: number; passed: boolean } | null;
}

const G = 6.6743e-11;

function buildResult(
  id: string,
  output: SimulationOutput,
  meta: {
    model: string;
    formula: string;
    parameters: Record<string, string | number | boolean | null>;
    assumptions: string[];
    limitations: string[];
    sampleSize: number;
    unit: string;
    inputs: Array<{ name: string; unit: string; count: number; hash: string }>;
  },
): ComputationResult<SimulationOutput> {
  return {
    id,
    kind: 'simulation',
    claim: 'model-prediction',
    value: output,
    unit: meta.unit,
    uncertainty: null,
    interval: null,
    sampleSize: meta.sampleSize,
    assumptions: meta.assumptions,
    limitations: [
      ...meta.limitations,
      'This is the output of the stated model, not a measurement of the real system.',
    ],
    skipped: false,
    reproducibility: buildReproducibility(
      meta.model,
      meta.formula,
      meta.inputs,
      meta.parameters,
      meta.assumptions,
      'No observations are involved: the model is evaluated at the stated parameters.',
      meta.sampleSize,
      null,
    ),
  };
}

/* --------------------------- classical mechanics ------------------------- */

/**
 * Projectile with quadratic drag, integrated by RK4.
 * Governing equations: ẍ = −k·|v|·ẋ, ÿ = −g − k·|v|·ẏ, with k = ½ρC_dA/m.
 */
export function projectile(options: {
  speed: number;
  angleDeg: number;
  gravity?: number;
  /** Drag coefficient k (1/m); 0 means vacuum. */
  dragK?: number;
  dt?: number;
  maxTime?: number;
}): ComputationResult<SimulationOutput> {
  const speed = assertFinite(options.speed, 'speed');
  const angleDeg = assertFinite(options.angleDeg, 'angleDeg');
  if (speed <= 0) throw new ScienceInputError('INVALID_PARAMETER', 'Launch speed must be positive.');
  if (angleDeg <= 0 || angleDeg >= 90) throw new ScienceInputError('INVALID_PARAMETER', 'Launch angle must be within (0°, 90°).');
  const g = assertFinite(options.gravity ?? 9.80665, 'gravity');
  if (g <= 0) throw new ScienceInputError('INVALID_PARAMETER', 'Gravity must be positive.');
  const k = assertFinite(options.dragK ?? 0, 'dragK');
  if (k < 0) throw new ScienceInputError('INVALID_PARAMETER', 'Drag coefficient cannot be negative.');
  const dt = assertFinite(options.dt ?? 0.005, 'dt');
  if (dt <= 0) throw new ScienceInputError('INVALID_PARAMETER', 'Time step must be positive.');
  const maxTime = assertFinite(options.maxTime ?? 120, 'maxTime');

  const theta = (angleDeg * Math.PI) / 180;
  let x = 0;
  let y = 0;
  let vx = speed * Math.cos(theta);
  let vy = speed * Math.sin(theta);

  const acceleration = (vxIn: number, vyIn: number) => {
    const speedNow = Math.hypot(vxIn, vyIn);
    return { ax: -k * speedNow * vxIn, ay: -g - k * speedNow * vyIn };
  };

  const t: number[] = [0];
  const xs: number[] = [0];
  const ys: number[] = [0];
  let time = 0;
  let maxHeight = 0;
  // Fixed step count (deterministic), bounded so a bad parameter set cannot hang.
  const maxSteps = Math.min(2_000_000, Math.ceil(maxTime / dt));
  for (let step = 0; step < maxSteps; step += 1) {
    // RK4 on the 4-state system [x, y, vx, vy]
    const k1 = { vx, vy, ...acceleration(vx, vy) };
    const k2a = acceleration(vx + (dt / 2) * k1.ax, vy + (dt / 2) * k1.ay);
    const k2 = { vx: vx + (dt / 2) * k1.ax, vy: vy + (dt / 2) * k1.ay, ...k2a };
    const k3a = acceleration(vx + (dt / 2) * k2.ax, vy + (dt / 2) * k2.ay);
    const k3 = { vx: vx + (dt / 2) * k2.ax, vy: vy + (dt / 2) * k2.ay, ...k3a };
    const k4a = acceleration(vx + dt * k3.ax, vy + dt * k3.ay);
    const k4 = { vx: vx + dt * k3.ax, vy: vy + dt * k3.ay, ...k4a };

    x += (dt / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx);
    y += (dt / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy);
    vx += (dt / 6) * (k1.ax + 2 * k2.ax + 2 * k3.ax + k4.ax);
    vy += (dt / 6) * (k1.ay + 2 * k2.ay + 2 * k3.ay + k4.ay);
    time += dt;
    if (y > maxHeight) maxHeight = y;
    t.push(time);
    xs.push(x);
    ys.push(y);
    if (y < 0 && time > dt * 2) break; // landed
  }

  const range = xs[xs.length - 1];
  const vacuumRange = (speed * speed * Math.sin(2 * theta)) / g;
  const validation =
    k === 0
      ? {
          name: 'Vacuum range vs analytic R = v²·sin(2θ)/g',
          expected: vacuumRange,
          observed: range,
          relativeError: Math.abs(range - vacuumRange) / vacuumRange,
          passed: Math.abs(range - vacuumRange) / vacuumRange < 1e-3,
        }
      : null;

  const output: SimulationOutput = {
    series: { t, y: ys, v: xs },
    diagnostics: {
      range_m: range,
      maxHeight_m: maxHeight,
      flightTime_s: time,
      steps: t.length,
      dt_s: dt,
      dragK: k,
      terminalComparison:
        k > 0 ? 'With drag the trajectory is asymmetric; the vacuum range is not an upper bound for all angles.' : 'Vacuum case: symmetric parabola.',
    },
    validation,
  };

  return buildResult(
    'simulation:projectile',
    output,
    {
      model: 'Projectile with optional quadratic drag (RK4)',
      formula: 'ẍ = −k|v|ẋ · ÿ = −g − k|v|ẏ · integrated by classical RK4 with dt fixed',
      parameters: { speed, angleDeg, gravity: g, dragK: k, dt },
      assumptions: [
        'Point mass; no lift, spin, wind or Coriolis term.',
        'Gravity is constant over the flight (valid for low altitudes).',
        'Quadratic drag with a constant coefficient k = ½ρC_dA/m.',
        'Air density is constant, so k does not vary with altitude.',
      ],
      limitations: [
        'Terminal velocity is only approximate for a real body with changing air density.',
        'RK4 is fourth-order accurate; halve dt to check convergence.',
      ],
      sampleSize: t.length,
      unit: 'm',
      inputs: [{ name: 'launch', unit: 'm/s, deg', count: 2, hash: `${speed}-${angleDeg}` }],
    },
  );
}

/* ------------------------------ orbital 2-body --------------------------- */

/**
 * Two-body Kepler orbit integrated with velocity Verlet (symplectic, so energy
 * oscillates around a constant instead of drifting).
 * The validation is the Kepler period from the vis-viva/third law.
 */
export function twoBodyOrbit(options: {
  /** Mass of the central body, kg. */
  centralMass: number;
  /** Initial separation, m. */
  radius: number;
  /** Initial tangential speed, m/s. A circular orbit needs sqrt(GM/r). */
  tangentialSpeed: number;
  /** Optional radial speed, m/s. */
  radialSpeed?: number;
  steps?: number;
  dt?: number;
}): ComputationResult<SimulationOutput> {
  const m = assertFinite(options.centralMass, 'centralMass');
  const r0 = assertFinite(options.radius, 'radius');
  const v0 = assertFinite(options.tangentialSpeed, 'tangentialSpeed');
  const vr0 = assertFinite(options.radialSpeed ?? 0, 'radialSpeed');
  if (m <= 0) throw new ScienceInputError('INVALID_PARAMETER', 'Central mass must be positive.');
  if (r0 <= 0) throw new ScienceInputError('INVALID_PARAMETER', 'Orbital radius must be positive.');
  if (v0 < 0) throw new ScienceInputError('INVALID_PARAMETER', 'Tangential speed cannot be negative.');
  const steps = Math.max(64, Math.min(500_000, Math.round(options.steps ?? 20_000)));
  const mu = G * m;

  // Orbital elements from the initial state.
  const specificEnergy = (v0 * v0 + vr0 * vr0) / 2 - mu / r0;
  if (!(specificEnergy < 0)) {
    throw new ScienceInputError(
      'INVALID_PARAMETER',
      'The initial state is unbounded (hyperbolic): a closed orbit needs v² < 2GM/r.',
    );
  }
  const semiMajor = -mu / (2 * specificEnergy);
  const specificAngularMomentum = r0 * v0;
  const eccentricity = Math.sqrt(Math.max(0, 1 + (2 * specificEnergy * specificAngularMomentum ** 2) / mu ** 2));
  const period = 2 * Math.PI * Math.sqrt(semiMajor ** 3 / mu);
  const dt = assertFinite(options.dt ?? period / steps, 'dt');
  if (!(dt > 0)) throw new ScienceInputError('INVALID_PARAMETER', 'Time step must be positive.');

  const accel = (x: number, y: number) => {
    const r = Math.hypot(x, y);
    const factor = -mu / r ** 3;
    return { ax: factor * x, ay: factor * y };
  };

  let x = r0;
  let y = 0;
  let vx = 0;
  let vy = v0 + 0 * vr0;
  let vxRadial = vr0;
  vx = vr0;
  vy = v0;

  const energy = () => {
    const r = Math.hypot(x, y);
    return 0.5 * (vx * vx + vy * vy) - mu / r;
  };

  const t: number[] = [0];
  const radiusSeries: number[] = [r0];
  const speedSeries: number[] = [Math.hypot(vx, vy)];
  let tNow = 0;
  const energyStart = energy();
  let maxEnergyDrift = 0;
  // Run one full period so the closure of the orbit can be checked.
  const totalSteps = Math.min(2_000_000, Math.round(period / dt));
  for (let step = 0; step < totalSteps; step += 1) {
    const a1 = accel(x, y);
    // Velocity Verlet: half kick, full drift, half kick.
    vx += 0.5 * dt * a1.ax;
    vy += 0.5 * dt * a1.ay;
    x += dt * vx;
    y += dt * vy;
    const a2 = accel(x, y);
    vx += 0.5 * dt * a2.ax;
    vy += 0.5 * dt * a2.ay;
    tNow += dt;
    t.push(tNow);
    radiusSeries.push(Math.hypot(x, y));
    speedSeries.push(Math.hypot(vx, vy));
    const drift = Math.abs(energy() - energyStart) / Math.abs(energyStart);
    if (drift > maxEnergyDrift) maxEnergyDrift = drift;
  }

  const closure = Math.abs(Math.hypot(x, y) - r0) / r0;
  const output: SimulationOutput = {
    series: { t, y: radiusSeries, v: speedSeries },
    diagnostics: {
      semiMajorAxis_m: semiMajor,
      eccentricity,
      period_s: period,
      energyDriftRelative: maxEnergyDrift,
      orbitClosureRelative: closure,
      specificEnergy_J_per_kg: specificEnergy,
      steps: t.length,
      dt_s: dt,
      method: 'velocity Verlet (symplectic, 2nd order)',
    },
    validation: {
      name: 'Period closure: state after one computed period should return to r₀',
      expected: r0,
      observed: Math.hypot(x, y),
      relativeError: closure,
      passed: closure < 0.02,
    },
  };

  return buildResult('simulation:two-body', output, {
    model: 'Two-body Kepler orbit (velocity Verlet)',
    formula: 'a = −GM·r/|r|³ integrated with velocity Verlet; P = 2π√(a³/GM)',
    parameters: { centralMass: m, radius: r0, tangentialSpeed: v0, radialSpeed: vr0, dt, steps: t.length },
    assumptions: [
      'Only two point masses; no third-body perturbations, no relativity, no non-gravitational forces.',
      'The central mass dominates, so the barycentre is treated as fixed.',
      'Initial state is bound (e < 1); hyperbolic states are rejected.',
    ],
    limitations: [
      'Energy error grows slowly for very long integrations; the diagnostic above reports the observed drift.',
      'Real orbits precess (J2, third bodies); this model cannot show that.',
    ],
    sampleSize: t.length,
    unit: 'm',
    inputs: [
      { name: 'central mass', unit: 'kg', count: 1, hash: String(m) },
      { name: 'radius', unit: 'm', count: 1, hash: String(r0) },
      { name: 'speed', unit: 'm/s', count: 1, hash: String(v0) },
    ],
  });
}

/* --------------------------- harmonic oscillator ------------------------- */

/**
 * Damped harmonic oscillator, integrated by RK4 and compared with the analytic
 * solution — a genuine validation of both the integrator and the model.
 * Governing equation: ẍ + 2ζω₀ẋ + ω₀²x = 0.
 */
export function dampedOscillator(options: {
  omega0: number;
  dampingRatio: number;
  amplitude: number;
  duration?: number;
  dt?: number;
}): ComputationResult<SimulationOutput> {
  const omega0 = assertFinite(options.omega0, 'omega0');
  const zeta = assertFinite(options.dampingRatio, 'dampingRatio');
  const amplitude = assertFinite(options.amplitude, 'amplitude');
  if (!(omega0 > 0)) throw new ScienceInputError('INVALID_PARAMETER', 'omega0 must be positive.');
  if (zeta < 0) throw new ScienceInputError('INVALID_PARAMETER', 'Damping ratio cannot be negative.');
  if (!(amplitude > 0)) throw new ScienceInputError('INVALID_PARAMETER', 'Amplitude must be positive.');
  const dt = assertFinite(options.dt ?? 0.002, 'dt');
  if (!(dt > 0)) throw new ScienceInputError('INVALID_PARAMETER', 'Time step must be positive.');
  const duration = assertFinite(options.duration ?? (10 * 2 * Math.PI) / omega0, 'duration');

  const underdamped = zeta < 1;
  const omegaD = underdamped ? omega0 * Math.sqrt(1 - zeta * zeta) : 0;
  const analytic = (t: number) => {
    if (underdamped) {
      // x(0)=A and ẋ(0)=0 forces the sine term with coefficient ζω₀/ω_D.
      const decay = Math.exp(-zeta * omega0 * t);
      return amplitude * decay * (Math.cos(omegaD * t) + ((zeta * omega0) / omegaD) * Math.sin(omegaD * t));
    }
    if (Math.abs(zeta - 1) < 1e-9) {
      // Critically damped, same initial conditions: A·e^(−ω₀t)·(1 + ω₀t).
      return amplitude * Math.exp(-omega0 * t) * (1 + omega0 * t);
    }
    const root = omega0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * omega0 + root;
    const r2 = -zeta * omega0 - root;
    const c2 = (-r1 * amplitude) / (r2 - r1);
    const c1 = amplitude - c2;
    return c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
  };

  let x = amplitude;
  let v = 0;
  const t: number[] = [0];
  const yt: number[] = [x];
  const analyticSeries: number[] = [analytic(0)];
  let time = 0;
  const steps = Math.min(500_000, Math.round(duration / dt));
  const accel = (position: number, velocity: number) => -omega0 * omega0 * position - 2 * zeta * omega0 * velocity;

  for (let step = 0; step < steps; step += 1) {
    const k1x = v;
    const k1v = accel(x, v);
    const k2x = v + (dt / 2) * k1v;
    const k2v = accel(x + (dt / 2) * k1x, v + (dt / 2) * k1v);
    const k3x = v + (dt / 2) * k2v;
    const k3v = accel(x + (dt / 2) * k2x, v + (dt / 2) * k2v);
    const k4x = v + dt * k3v;
    const k4v = accel(x + dt * k3x, v + dt * k3v);
    x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    time += dt;
    t.push(time);
    yt.push(x);
    analyticSeries.push(analytic(time));
  }

  // Max absolute deviation from the analytic solution, relative to the amplitude.
  let maxError = 0;
  for (let index = 0; index < yt.length; index += 1) {
    maxError = Math.max(maxError, Math.abs(yt[index] - analyticSeries[index]));
  }
  const relativeError = maxError / amplitude;

  const output: SimulationOutput = {
    series: { t, y: yt, v: analyticSeries },
    diagnostics: {
      regime: underdamped ? 'underdamped' : Math.abs(zeta - 1) < 1e-9 ? 'critically damped' : 'overdamped',
      dampedFrequency_rad_s: omegaD,
      steps: t.length,
      dt_s: dt,
      maxAnalyticDeviation: maxError,
    },
    validation: {
      name: 'Numerical vs analytic solution (max |x_num − x_analytic| / A)',
      expected: 0,
      observed: relativeError,
      relativeError,
      passed: relativeError < 0.01,
    },
  };

  return buildResult('simulation:damped-oscillator', output, {
    model: 'Damped harmonic oscillator (RK4 vs analytic)',
    formula: 'ẍ + 2ζω₀ẋ + ω₀²x = 0 · x(t) = A·e^(−ζω₀t)·cos(ω_D t) for ζ < 1',
    parameters: { omega0, dampingRatio: zeta, amplitude, dt, duration },
    assumptions: [
      'Linear restoring force and velocity-proportional damping.',
      'Constant coefficients; no driving term.',
    ],
    limitations: [
      'Real oscillators are only linear over a small amplitude range.',
      'Coulomb (dry) friction is not modelled — it is not proportional to velocity.',
    ],
    sampleSize: t.length,
    unit: 'same as amplitude',
    inputs: [
      { name: 'omega0', unit: 'rad/s', count: 1, hash: String(omega0) },
      { name: 'zeta', unit: 'dimensionless', count: 1, hash: String(zeta) },
    ],
  });
}

/* ------------------------------- thermal --------------------------------- */

/** Newton cooling: T(t) = T_env + (T₀ − T_env)·e^(−t/τ), integrated with RK4. */
export function newtonCooling(options: {
  initialTemperature: number;
  environmentTemperature: number;
  /** Time constant τ in seconds. */
  tau: number;
  duration: number;
  dt?: number;
}): ComputationResult<SimulationOutput> {
  const t0 = assertFinite(options.initialTemperature, 'initialTemperature');
  const env = assertFinite(options.environmentTemperature, 'environmentTemperature');
  const tau = assertFinite(options.tau, 'tau');
  const duration = assertFinite(options.duration, 'duration');
  if (!(tau > 0)) throw new ScienceInputError('INVALID_PARAMETER', 'The time constant must be positive.');
  if (!(duration > 0)) throw new ScienceInputError('INVALID_PARAMETER', 'Duration must be positive.');
  const dt = assertFinite(options.dt ?? duration / 2000, 'dt');
  if (!(dt > 0)) throw new ScienceInputError('INVALID_PARAMETER', 'Time step must be positive.');

  const derivative = (temperature: number) => -(temperature - env) / tau;
  const analytic = (t: number) => env + (t0 - env) * Math.exp(-t / tau);

  let temperature = t0;
  let time = 0;
  const t: number[] = [0];
  const series: number[] = [t0];
  const steps = Math.min(500_000, Math.round(duration / dt));
  for (let step = 0; step < steps; step += 1) {
    const k1 = derivative(temperature);
    const k2 = derivative(temperature + (dt / 2) * k1);
    const k3 = derivative(temperature + (dt / 2) * k2);
    const k4 = derivative(temperature + dt * k3);
    temperature += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    time += dt;
    t.push(time);
    series.push(temperature);
  }

  let maxError = 0;
  for (let index = 0; index < series.length; index += 1) {
    maxError = Math.max(maxError, Math.abs(series[index] - analytic(t[index])));
  }
  const span = Math.max(1e-9, Math.abs(t0 - env));
  const relativeError = maxError / span;

  const output: SimulationOutput = {
    series: { t, y: series },
    diagnostics: {
      finalTemperature: temperature,
      analyticFinal: analytic(duration),
      approachedEnvironmentWithin: Math.abs(temperature - env) < 0.01 * span,
      steps: t.length,
      dt_s: dt,
    },
    validation: {
      name: 'RK4 vs closed-form exponential (max error / |T₀ − T_env|)',
      expected: 0,
      observed: relativeError,
      relativeError,
      passed: relativeError < 1e-6,
    },
  };

  return buildResult('simulation:newton-cooling', output, {
    model: 'Newton cooling (RK4 vs closed form)',
    formula: 'dT/dt = −(T − T_env)/τ · T(t) = T_env + (T₀ − T_env)e^(−t/τ)',
    parameters: { initialTemperature: t0, environmentTemperature: env, tau, duration, dt },
    assumptions: [
      'A single lumped thermal capacitance with no internal gradient.',
      'Constant environment temperature and constant heat-transfer coefficient.',
      'Radiative losses are folded into τ rather than modelled as T⁴.',
    ],
    limitations: [
      'Not valid when the body has significant internal temperature gradients.',
      'Radiation-dominated cooling requires the Stefan–Boltzmann term.',
    ],
    sampleSize: t.length,
    unit: 'K',
    inputs: [
      { name: 'T0', unit: 'K', count: 1, hash: String(t0) },
      { name: 'T_env', unit: 'K', count: 1, hash: String(env) },
      { name: 'tau', unit: 's', count: 1, hash: String(tau) },
    ],
  });
}

export const SIMULATION_MODELS = [
  { id: 'projectile', label: 'Projectile with drag', discipline: 'Classical mechanics' },
  { id: 'two-body', label: 'Two-body orbit', discipline: 'Orbital mechanics' },
  { id: 'damped-oscillator', label: 'Damped harmonic oscillator', discipline: 'Waves & oscillations' },
  { id: 'newton-cooling', label: 'Newton cooling', discipline: 'Thermal' },
] as const;
