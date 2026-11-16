/**
 * COSMORA — single source of truth for every statistical threshold.
 *
 * Before this module the same numbers were written literally in four places that
 * disagreed with each other:
 *
 *   | threshold                       | doc `03_STATISTICAL_METHOD.md` | implementation | UI copy        | tests        |
 *   |---------------------------------|-------------------------------|----------------|----------------|--------------|
 *   | "significant" trend threshold   | α = 0.01 (§4.3)               | α = 0.05       | "α = 0.05"     | unasserted   |
 *   | minimum annual records          | 10 (`insufficient data`)      | 10             | "< 10 yrs"     | unasserted   |
 *   | effective-sample-size floor     | 10 (§4.4)                     | not implemented| not shown      | not tested   |
 *   | short-record flag band          | 10 ≤ effN < 14                | not implemented| not shown      | not tested   |
 *   | autocorrelation lag range       | min(n−3, ⌊n/3⌋)               | min(n−3, 10)   | not shown      | not tested   |
 *
 * `docs/earth-lab/03_STATISTICAL_METHOD.md` is the governing specification. Its
 * α = 0.01 choice is not a matter of taste: §4.3 reports a measured
 * false-positive rate of 4.2 % at α = 0.01 versus 13.0 % at α = 0.05 under
 * AR(1) φ = 0.6 (reproduced by `scripts/research/trend-method-calibration.mjs`).
 * The implementation shipped 0.05, i.e. the value the study rejected.
 *
 * This file is the only place these numbers may appear. `npm run test:stats`
 * asserts that the UI, the engine and the specification agree with it.
 *
 * Every constant below is either (a) mandated by the specification document, or
 * (b) a documented convention with its source. Nothing here is tuned to make a
 * particular dataset look significant.
 */

/** Everything in one frozen object so a caller cannot mutate shared state. */
export interface StatisticsConfig {
  /* ---------------------------------------------------------- inference */

  /**
   * Two-sided threshold for the *published verdict* on any monotonic trend test.
   *
   * 0.01, not 0.05: calibration study §4.3. At α = 0.01 the Hamed–Rao corrected
   * test holds a measured false-positive rate of 0.2 % (φ = 0), 0.5 % (φ = 0.3),
   * 4.2 % (φ = 0.6) and 7.7 % (φ = 0.8) on n = 30 annual series with no trend.
   * At α = 0.05 those rates are 1.2 / 5.2 / 13.0 / 18.3 %. The conservative
   * threshold is the defensible one for a public climate tool.
   */
  readonly trendAlpha: number;

  /**
   * Threshold used for the *literal* `significantAt05` / `significantAt01`
   * fields on every result object.
   *
   * These fields keep their exact historical meaning ("was p below this exact
   * number") so no existing consumer changes behaviour silently. The verdict a
   * reader sees is `significant`, which uses `trendAlpha`.
   */
  readonly literalAlpha05: number;
  readonly literalAlpha01: number;

  /**
   * Threshold for the two-epoch mean comparison (historical split) and for the
   * cross-series correlation screen.
   *
   * These are *not* trend tests. The specification governs the trend verdict
   * only (§4.3), so this stays at the conventional 0.05 — but the comparison is
   * additionally gated on the dependence checks in `minEffectiveObservations`
   * and refuses to print a verdict when they fail.
   */
  readonly comparisonAlpha: number;

  /* ------------------------------------------------- sample-size gating */

  /** Minimum complete annual records before Mann–Kendall may report a p-value. */
  readonly minAnnualObservations: number;

  /**
   * Minimum *effective* (autocorrelation-adjusted) observations before any
   * inferential conclusion is published. Specification §4.4.
   */
  readonly minEffectiveObservations: number;

  /**
   * At or below this effective sample size the result is still computed but is
   * labelled `short record` rather than `strong`. Specification §4.4.
   */
  readonly shortRecordEffectiveObservations: number;

  /** Minimum complete annual records for the Pettitt change-point test. */
  readonly minPettittObservations: number;

  /** Minimum complete years per epoch for the two-epoch comparison. */
  readonly minSplitEpochYears: number;

  /** Minimum observations per calendar month inside the seasonal test. */
  readonly minSeasonalMonthObservations: number;

  /** Minimum number of usable calendar months for the seasonal test. */
  readonly minSeasonalMonths: number;

  /** Minimum distinct years spanned for the seasonal test. */
  readonly minSeasonalYears: number;

  /** Minimum overlapping observations for a cross-series correlation. */
  readonly minCorrelationObservations: number;

  /** WMO climatological normal length (WMO-No. 1203) — a labelling threshold only. */
  readonly wmoClimatologyYears: number;

  /* --------------------------------------------------- autocorrelation */

  /**
   * Largest lag examined for the Hamed–Rao variance correction: ⌊n/3⌋.
   *
   * Specification §4.2 step 2. The shipped code used a hard 10, which for a
   * 30-year record examines a third of the series and — measured — inflates the
   * false-positive rate from 12.3 % to 20.8 % at φ = 0.6 because the
   * (n−k)(n−k−1)(n−k−2) weights stay large while ρ̂_k is pure noise.
   */
  readonly maxAutocorrelationLagDivisor: number;

  /** Absolute cap on lags examined, independent of record length. */
  readonly maxAutocorrelationLagCap: number;

  /* ------------------------------------------------------- resampling */

  /** Bootstrap replicates for the block-bootstrap inference. */
  readonly bootstrapReplicates: number;

  /** Fixed seed — the bootstrap must be reproducible run to run. */
  readonly bootstrapSeed: number;
}

export const STATISTICS_CONFIG: StatisticsConfig = Object.freeze({
  trendAlpha: 0.01,
  literalAlpha05: 0.05,
  literalAlpha01: 0.01,
  comparisonAlpha: 0.05,

  minAnnualObservations: 10,
  minEffectiveObservations: 10,
  shortRecordEffectiveObservations: 14,
  minPettittObservations: 12,
  minSplitEpochYears: 2,
  minSeasonalMonthObservations: 5,
  minSeasonalMonths: 6,
  minSeasonalYears: 8,
  minCorrelationObservations: 12,
  wmoClimatologyYears: 30,

  maxAutocorrelationLagDivisor: 3,
  maxAutocorrelationLagCap: 10,

  bootstrapReplicates: 999,
  bootstrapSeed: 0x5eed1e
} as const);

/**
 * Realised autocorrelation lag count for a record of length `n`.
 *
 * `min(n − 3, ⌊n/divisor⌋, cap)` — the `n − 3` term keeps the
 * (n−k)(n−k−1)(n−k−2) weight positive.
 */
export function maxAutocorrelationLag(n: number, config: StatisticsConfig = STATISTICS_CONFIG): number {
  if (n < 4) return 0;
  return Math.max(
    0,
    Math.min(n - 3, Math.floor(n / config.maxAutocorrelationLagDivisor), config.maxAutocorrelationLagCap)
  );
}

/**
 * Human-readable description of the published verdict rule, for the UI.
 *
 * Generated from the configuration so the panel cannot drift from the engine.
 */
export function describeTrendAlpha(config: StatisticsConfig = STATISTICS_CONFIG): string {
  return `α = ${config.trendAlpha} (two-sided)`;
}

/** Machine-readable provenance so a result can always be traced to its config. */
export interface StatisticsConfigSnapshot {
  trendAlpha: number;
  literalAlpha05: number;
  literalAlpha01: number;
  comparisonAlpha: number;
  minAnnualObservations: number;
  minEffectiveObservations: number;
  shortRecordEffectiveObservations: number;
  bootstrapReplicates: number;
  maxAutocorrelationLagDivisor: number;
}

/** Frozen copy of the thresholds that produced a result. */
export function statisticsConfigSnapshot(
  config: StatisticsConfig = STATISTICS_CONFIG
): StatisticsConfigSnapshot {
  return Object.freeze({
    trendAlpha: config.trendAlpha,
    literalAlpha05: config.literalAlpha05,
    literalAlpha01: config.literalAlpha01,
    comparisonAlpha: config.comparisonAlpha,
    minAnnualObservations: config.minAnnualObservations,
    minEffectiveObservations: config.minEffectiveObservations,
    shortRecordEffectiveObservations: config.shortRecordEffectiveObservations,
    bootstrapReplicates: config.bootstrapReplicates,
    maxAutocorrelationLagDivisor: config.maxAutocorrelationLagDivisor
  });
}
