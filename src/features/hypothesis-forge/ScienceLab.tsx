/**
 * NOVA HYPOTHESIS FORGE — computational laboratory.
 *
 * A panel inside the existing Scientific Analysis section. It runs the
 * deterministic science engines (`src/lib/forge/science/*`) on the series the
 * investigation already retrieved — it never fetches, never predicts with a
 * model, and never invents a number.
 *
 * The honesty rules are structural, not cosmetic:
 *  - the panel header states that no AI is involved;
 *  - every result prints its formula, assumptions, sample size and engine
 *    version, so a reader can redo it by hand;
 *  - Bayesian results print the prior and the weight the data carried, because a
 *    posterior without its prior is a number pretending to be objective;
 *  - simulation output is labelled a model prediction and shows whether its
 *    internal validation passed;
 *  - screening output is labelled a candidate, with what verification requires.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, FlaskConical, Info, Microscope, Sigma } from 'lucide-react';
import type { NormalizedSeries } from '../../lib/forge/types';
import {
  describe,
  detectOutliers,
  jackknifeSensitivity,
  compareTrendModels,
  linearRegression,
  correlate,
} from '../../lib/forge/science/stats';
import { normalNormalUpdate, priorSensitivity } from '../../lib/forge/science/bayes';
import {
  dampedOscillator,
  newtonCooling,
  projectile,
  twoBodyOrbit,
  SIMULATION_MODELS,
} from '../../lib/forge/science/simulation';
import { scanSeries } from '../../lib/forge/science/discovery';
import { SCIENCE_ENGINE_VERSION, type ComputationResult } from '../../lib/forge/science/contracts';

type LabTab = 'stats' | 'model' | 'bayes' | 'simulation' | 'screening';

const TABS: Array<{ id: LabTab; key: string }> = [
  { id: 'stats', key: 'hfLabTabStats' },
  { id: 'model', key: 'hfLabTabModel' },
  { id: 'bayes', key: 'hfLabTabBayes' },
  { id: 'simulation', key: 'hfLabTabSim' },
  { id: 'screening', key: 'hfLabTabScreen' },
];

const SIM_DEFAULTS: Record<string, Record<string, number>> = {
  projectile: { speed: 20, angleDeg: 45, dragK: 0.005 },
  'two-body': { radiusKm: 7000, speed: 7.546, massEarths: 1 },
  'damped-oscillator': { omega0: 2, dampingRatio: 0.15, amplitude: 1 },
  'newton-cooling': { initialTemperature: 373, environmentTemperature: 293, tauSeconds: 600 },
};

function number(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 1e-3 || magnitude >= 1e6)) return value.toExponential(digits - 1);
  return value.toFixed(Math.max(0, digits - 1 - Math.floor(Math.log10(Math.max(magnitude, 1e-12)))));
}

/** Compact audit block; identical markup for every result in the panel. */
function Audit({ result }: { result: ComputationResult<unknown> }) {
  const { t } = useTranslation();
  const record = result.reproducibility;
  return (
    <details className="forge-details forge-lab__audit">
      <summary>{t('hfLabRepro')}</summary>
      <dl className="forge-lab__meta">
        <div>
          <dt>Method</dt>
          <dd>{record.method}</dd>
        </div>
        <div>
          <dt>Formula</dt>
          <dd className="forge-mono">{record.formula}</dd>
        </div>
        <div>
          <dt>{t('hfLabEngineVersion')}</dt>
          <dd className="forge-mono">{record.engineVersion}</dd>
        </div>
        <div>
          <dt>{t('hfLabSamples')}</dt>
          <dd>{record.sampleSize}</dd>
        </div>
        <div>
          <dt>Inputs</dt>
          <dd className="forge-mono">
            {record.inputs.map((input) => `${input.name} (${input.unit}) · n=${input.count} · #${input.hash}`).join(' ; ') || '—'}
          </dd>
        </div>
        <div>
          <dt>{t('hfLabAssumptionsLabel')}</dt>
          <dd>
            <ul>
              {record.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt>Missing values</dt>
          <dd>{record.missingValuePolicy}</dd>
        </div>
      </dl>
    </details>
  );
}

function Limitations({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="forge-lab__limits">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

export function ScienceLab({ seriesList }: { seriesList: NormalizedSeries[] }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<LabTab>('stats');
  // Only series that actually carry observations are offered. `partial` is
  // included on purpose: a partially retrieved series is still real data, and
  // its missing-value count is printed rather than hidden.
  const usable = useMemo(
    () =>
      seriesList.filter(
        (series) =>
          (series.status === 'live' || series.status === 'cached' || series.status === 'partial') &&
          series.observations.filter((observation) => observation.value !== null).length > 1,
      ),
    [seriesList],
  );
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const active = useMemo(
    () => usable.find((series) => series.id === seriesId) ?? usable[0] ?? null,
    [usable, seriesId],
  );

  const values = useMemo(
    () => (active ? active.observations.map((observation) => observation.value) : []),
    [active],
  );
  const times = useMemo(
    () => (active ? active.observations.map((observation) => Date.parse(observation.time)) : []),
    [active],
  );

  const stats = useMemo(() => (active ? describe(values, active.unit, active.label) : null), [active, values]);
  const outliers = useMemo(() => (active ? detectOutliers(values, active.unit, active.label) : null), [active, values]);
  const influence = useMemo(() => (active ? jackknifeSensitivity(values, active.unit, active.label) : null), [active, values]);

  const index = useMemo(() => values.map((_, position) => position + 1), [values]);
  const regression = useMemo(
    () => (active ? linearRegression(index, values, { x: 'sample index', y: active.unit }, { x: 'sample index', y: active.label }) : null),
    [active, index, values],
  );
  const trendModel = useMemo(
    () => (active ? compareTrendModels(index, values, { x: 'sample index', y: active.unit }) : null),
    [active, index, values],
  );
  const pairCorrelation = useMemo(() => {
    if (usable.length < 2 || !active) return null;
    const other = usable.find((series) => series.id !== active.id);
    if (!other) return null;
    // Align on timestamp, so a calendar mismatch cannot create a false pair.
    const byTime = new Map(other.observations.map((observation) => [observation.time, observation.value]));
    const x: Array<number | null> = [];
    const y: Array<number | null> = [];
    for (const observation of active.observations) {
      if (!byTime.has(observation.time)) continue;
      x.push(observation.value);
      y.push(byTime.get(observation.time) ?? null);
    }
    return correlate(x, y, { x: active.unit, y: other.unit }, { x: active.label, y: other.label });
  }, [active, usable]);

  /* ------------------------------- Bayesian ------------------------------- */
  const suggestedPrior = useMemo(() => {
    if (!stats) return { mean: 0, sd: 1 };
    return { mean: Number(stats.value.median.toFixed(3)), sd: Number(Math.max(stats.value.sd, 1e-6).toFixed(3)) };
  }, [stats]);
  const [priorMean, setPriorMean] = useState<string>('');
  const [priorSd, setPriorSd] = useState<string>('');
  const bayes = useMemo(() => {
    if (!active) return null;
    const mean = priorMean === '' ? suggestedPrior.mean : Number(priorMean);
    const sd = priorSd === '' ? suggestedPrior.sd * 2 : Number(priorSd);
    if (!Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) return null;
    try {
      const update = normalNormalUpdate(values, { priorMean: mean, priorSd: sd, unit: active.unit, label: active.label });
      const sweep = priorSensitivity(values, {
        priorMeans: [mean - 2 * sd, mean, mean + 2 * sd],
        priorSds: [sd / 2, sd, sd * 2],
        unit: active.unit,
        label: active.label,
      });
      return { update, sweep };
    } catch {
      return null;
    }
  }, [active, values, priorMean, priorSd, suggestedPrior]);

  /* ------------------------------ simulation ------------------------------ */
  const [simModel, setSimModel] = useState<string>('projectile');
  const [simParams, setSimParams] = useState<Record<string, number>>(SIM_DEFAULTS.projectile);
  const simulation = useMemo(() => {
    try {
      if (simModel === 'projectile') {
        return projectile({
          speed: simParams.speed,
          angleDeg: simParams.angleDeg,
          dragK: simParams.dragK,
          dt: 0.002,
        });
      }
      if (simModel === 'two-body') {
        const mu = 6.6743e-11 * 5.9722e24 * simParams.massEarths;
        const radius = simParams.radiusKm * 1000;
        return twoBodyOrbit({
          centralMass: 5.9722e24 * simParams.massEarths,
          radius,
          tangentialSpeed: simParams.speed,
          steps: Math.max(2000, Math.round((2 * Math.PI * Math.sqrt(radius ** 3 / mu)) / 30)),
        });
      }
      if (simModel === 'damped-oscillator') {
        return dampedOscillator({
          omega0: simParams.omega0,
          dampingRatio: simParams.dampingRatio,
          amplitude: simParams.amplitude,
          duration: 20,
        });
      }
      return newtonCooling({
        initialTemperature: simParams.initialTemperature,
        environmentTemperature: simParams.environmentTemperature,
        tau: simParams.tauSeconds,
        duration: simParams.tauSeconds * 5,
      });
    } catch {
      return null;
    }
  }, [simModel, simParams]);

  /* ------------------------------- screening ------------------------------ */
  const screening = useMemo(
    () => (active ? scanSeries({ values, times, unit: active.unit, label: active.label }) : null),
    [active, values, times],
  );

  if (!active) {
    return (
      <div className="forge-lab forge-lab--empty">
        <p className="forge-empty">{t('hfLabEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="forge-lab">
      <header className="forge-lab__head">
        <div className="forge-lab__title">
          <FlaskConical size={16} aria-hidden />
          <h3>{t('hfLabTitle')}</h3>
          <span className="forge-lab__badge">{t('hfLabNoAi')}</span>
        </div>
        <label className="forge-lab__picker">
          <span>{t('hfLabSeries')}</span>
          <select value={active.id} onChange={(event) => setSeriesId(event.target.value)}>
            {usable.map((series) => (
              <option key={series.id} value={series.id}>
                {series.label} ({series.unit})
              </option>
            ))}
          </select>
        </label>
      </header>

      <p className="forge-lab__hint">{t('hfLabHint')}</p>

      <div className="forge-lab__tabs" role="tablist" aria-label={t('hfLabTitle')}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`forge-lab__tab${tab === entry.id ? ' is-active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {t(entry.key)}
          </button>
        ))}
      </div>

      {/* ------------------------------- statistics ------------------------------- */}
      {tab === 'stats' && stats ? (
        <div className="forge-lab__panel" role="tabpanel">
          <dl className="forge-lab__grid">
            <div>
              <dt>{t('hfLabSamples')}</dt>
              <dd>{stats.sampleSize}</dd>
            </div>
            <div>
              <dt>{t('hfLabMean')}</dt>
              <dd className="forge-mono">
                {number(stats.value.mean)} {stats.unit}
              </dd>
            </div>
            <div>
              <dt>{t('hfLabMedian')}</dt>
              <dd className="forge-mono">
                {number(stats.value.median)} {stats.unit}
              </dd>
            </div>
            <div>
              <dt>{t('hfLabSd')}</dt>
              <dd className="forge-mono">{number(stats.value.sd)}</dd>
            </div>
            <div>
              <dt>{t('hfLabInterval')}</dt>
              <dd className="forge-mono">
                {stats.interval ? `[${number(stats.interval[0])}, ${number(stats.interval[1])}]` : '—'}
              </dd>
            </div>
            <div>
              <dt>{t('hfLabOutliers')}</dt>
              <dd>
                {outliers && !outliers.skipped && outliers.value.indices.length > 0
                  ? `${outliers.value.indices.length}`
                  : t('hfLabOutlierNone')}
              </dd>
            </div>
            <div>
              <dt>{t('hfLabInfluence')}</dt>
              <dd className="forge-mono">
                {influence && !influence.skipped && influence.value.mostInfluential
                  ? `#${influence.value.mostInfluential.index + 1} → ${number(influence.value.mostInfluential.leaveOneOutMean)}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>{t('hfLabMissingValues')}</dt>
              <dd>
                {active.missing.count} / {active.missing.count + active.observations.length} ({active.missing.method})
              </dd>
            </div>
          </dl>
          <Limitations lines={stats.limitations} />
          <Audit result={stats} />
        </div>
      ) : null}

      {/* --------------------------------- model --------------------------------- */}
      {tab === 'model' && regression && trendModel ? (
        <div className="forge-lab__panel" role="tabpanel">
          <dl className="forge-lab__grid">
            <div>
              <dt>Trend slope</dt>
              <dd className="forge-mono">
                {number(regression.value.slope)} {active.unit} per sample
              </dd>
            </div>
            <div>
              <dt>{t('hfLabInterval')}</dt>
              <dd className="forge-mono">
                {regression.value.slopeInterval
                  ? `[${number(regression.value.slopeInterval[0])}, ${number(regression.value.slopeInterval[1])}]`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>R²</dt>
              <dd className="forge-mono">{number(regression.value.rSquared)}</dd>
            </div>
            <div>
              <dt>{t('hfLabPreferredModel')}</dt>
              <dd>{trendModel.value.preferred === 'indistinguishable' ? t('hfLabIndistinguishable') : trendModel.value.preferred}</dd>
            </div>
            <div>
              <dt>ΔAIC</dt>
              <dd className="forge-mono">{trendModel.value.deltaAic === null ? '—' : number(trendModel.value.deltaAic)}</dd>
            </div>
            <div>
              <dt>{t('hfLabPairsAvailable')}</dt>
              <dd>{pairCorrelation ? pairCorrelation.sampleSize : '—'}</dd>
            </div>
          </dl>
          {pairCorrelation && !pairCorrelation.skipped ? (
            <p className="forge-muted">
              {pairCorrelation.reproducibility.method}: r = {number(pairCorrelation.value.r)} ({pairCorrelation.sampleSize}{' '}
              aligned samples){' '}
              {pairCorrelation.interval
                ? `· 95 % interval [${number(pairCorrelation.interval[0])}, ${number(pairCorrelation.interval[1])}]`
                : ''}
            </p>
          ) : null}
          <Limitations lines={[...regression.limitations, ...trendModel.limitations]} />
          <Audit result={regression} />
        </div>
      ) : null}

      {/* -------------------------------- Bayesian ------------------------------- */}
      {tab === 'bayes' ? (
        <div className="forge-lab__panel" role="tabpanel">
          <div className="forge-lab__priors">
            <label>
              <span>{t('hfLabPriorMean')}</span>
              <input
                type="number"
                step="any"
                value={priorMean}
                placeholder={number(suggestedPrior.mean)}
                onChange={(event) => setPriorMean(event.target.value)}
              />
            </label>
            <label>
              <span>{t('hfLabPriorSd')}</span>
              <input
                type="number"
                step="any"
                min="0"
                value={priorSd}
                placeholder={number(suggestedPrior.sd * 2)}
                onChange={(event) => setPriorSd(event.target.value)}
              />
            </label>
            <p className="forge-muted">{t('hfLabPriorHint')}</p>
          </div>
          {bayes ? (
            <>
              <dl className="forge-lab__grid">
                <div>
                  <dt>{t('hfLabPosterior')}</dt>
                  <dd className="forge-mono">
                    {number(bayes.update.value.posteriorMean)} {bayes.update.unit}
                  </dd>
                </div>
                <div>
                  <dt>{t('hfLabCredible')}</dt>
                  <dd className="forge-mono">
                    [{number(bayes.update.value.credibleInterval[0])}, {number(bayes.update.value.credibleInterval[1])}]
                  </dd>
                </div>
                <div>
                  <dt>{t('hfLabWeightOnData')}</dt>
                  <dd>{number(bayes.update.value.weightOnData, 3)}</dd>
                </div>
                <div>
                  <dt>Prior</dt>
                  <dd className="forge-mono">
                    N({number(bayes.update.value.priorMean)}, {number(bayes.update.value.priorSd)}²)
                  </dd>
                </div>
              </dl>
              <table className="forge-lab__sweep">
                <caption>{t('hfLabPriorSweep')}</caption>
                <thead>
                  <tr>
                    <th>Prior mean</th>
                    <th>Prior sd</th>
                    <th>Posterior mean</th>
                    <th>Weight on data</th>
                  </tr>
                </thead>
                <tbody>
                  {bayes.sweep.value.map((row) => (
                    <tr key={`${row.priorMean}-${row.priorSd}`}>
                      <td className="forge-mono">{number(row.priorMean)}</td>
                      <td className="forge-mono">{number(row.priorSd)}</td>
                      <td className="forge-mono">{number(row.posteriorMean)}</td>
                      <td className="forge-mono">{number(row.weightOnData, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Limitations lines={bayes.update.limitations} />
              <Audit result={bayes.update} />
            </>
          ) : (
            <p className="forge-empty">{t('hfLabPriorInvalid')}</p>
          )}
        </div>
      ) : null}

      {/* ------------------------------- simulation ------------------------------ */}
      {tab === 'simulation' ? (
        <div className="forge-lab__panel" role="tabpanel">
          <div className="forge-lab__priors">
            <label>
              <span>{t('hfLabSimModel')}</span>
              <select
                value={simModel}
                onChange={(event) => {
                  setSimModel(event.target.value);
                  setSimParams(SIM_DEFAULTS[event.target.value]);
                }}
              >
                {SIMULATION_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label} — {model.discipline}
                  </option>
                ))}
              </select>
            </label>
            {Object.entries(simParams).map(([key, value]) => (
              <label key={key}>
                <span>{key}</span>
                <input
                  type="number"
                  step="any"
                  value={value}
                  onChange={(event) =>
                    setSimParams((previous) => ({ ...previous, [key]: Number(event.target.value) }))
                  }
                />
              </label>
            ))}
          </div>
          {simulation ? (
            <>
              {simulation.value.validation ? (
                <p className={`forge-lab__validation${simulation.value.validation.passed ? ' is-pass' : ' is-fail'}`}>
                  {simulation.value.validation.passed ? <Check size={14} /> : <AlertTriangle size={14} />}
                  {t('hfLabValidation')}: {simulation.value.validation.name} —{' '}
                  {simulation.value.validation.passed ? t('hfLabValidationPassed') : t('hfLabValidationFailed')} (
                  {number(simulation.value.validation.relativeError, 3)})
                </p>
              ) : (
                <p className="forge-lab__validation is-unknown">
                  <Info size={14} /> {t('hfLabNoValidation')}
                </p>
              )}
              <dl className="forge-lab__grid">
                {Object.entries(simulation.value.diagnostics).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd className="forge-mono">{typeof value === 'number' ? number(value) : String(value)}</dd>
                  </div>
                ))}
              </dl>
              <p className="forge-lab__modelnote">{t('hfLabSimNote')}</p>
              <Limitations lines={simulation.limitations} />
              <Audit result={simulation} />
            </>
          ) : (
            <p className="forge-empty">{t('hfLabSimInvalid')}</p>
          )}
        </div>
      ) : null}

      {/* -------------------------------- screening ------------------------------ */}
      {tab === 'screening' && screening ? (
        <div className="forge-lab__panel" role="tabpanel">
          <p className="forge-lab__hint">{screening.value.summary}</p>
          {screening.value.candidates.length === 0 ? (
            <p className="forge-empty">{t('hfLabNoCandidates')}</p>
          ) : (
            <ul className="forge-lab__candidates">
              {screening.value.candidates.map((candidate) => (
                <li key={candidate.id} className={`forge-lab__candidate is-${candidate.claim}`}>
                  <header>
                    <Microscope size={14} aria-hidden />
                    <strong>{candidate.title}</strong>
                    <span className="forge-lab__claim">{candidate.claim}</span>
                    <span className="forge-lab__unverified">{t('hfLabNotDiscovery')}</span>
                  </header>
                  <p>{candidate.statement}</p>
                  <p className="forge-muted">
                    <strong>{t('hfLabVerificationRequired')}:</strong> {candidate.verificationRequired}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {screening.value.notRun.length > 0 ? (
            <details className="forge-details">
              <summary>{t('hfLabNotRun')}</summary>
              <ul>
                {screening.value.notRun.map((entry) => (
                  <li key={entry.method}>
                    <strong>{entry.method}</strong> — {entry.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <Audit result={screening} />
        </div>
      ) : null}

      <footer className="forge-lab__foot">
        <Sigma size={13} aria-hidden />
        <span>
          {t('hfLabEngineNote')} · {SCIENCE_ENGINE_VERSION}
        </span>
      </footer>
    </div>
  );
}
