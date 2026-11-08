/**
 * Orbit Lab — real orbital mechanics, shown with its formula.
 *
 * Two modes, both deterministic:
 *   semi-major axis  → Kepler's third law for the period, circular speed there
 *   altitude         → radius = body radius + altitude, then period and speed
 *
 * The surface never says a simulation ran and never invents a value: invalid
 * input is rejected, and every number is printed next to the formula and the
 * substituted figures that produced it.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, MessageSquare } from 'lucide-react';
import {
  CENTRAL_BODIES,
  escapeSpeedKmS,
  formatPeriod,
  orbitalPeriodDays,
  orbitalSpeedKmS,
  radiusFromAltitude,
  type CentralBody,
} from './astronomy';
import { askNovaWithPrompt } from './ModuleSurface';

type Mode = 'axis' | 'altitude';

interface Result {
  body: CentralBody;
  mode: Mode;
  radiusKm: number;
  periodDays: number;
  speedKmS: number;
  escapeKmS: number;
  formula: string;
}

export default function OrbitLabSurface() {
  const { t } = useTranslation();
  const [body, setBody] = useState<CentralBody>('earth');
  const [mode, setMode] = useState<Mode>('axis');
  const [value, setValue] = useState('7000');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compute = () => {
    const numeric = Number(value);
    const central = CENTRAL_BODIES[body];
    const radius = mode === 'altitude' ? radiusFromAltitude(numeric, central.radius) : numeric;
    if (radius === null) {
      setError(t('wsOrbitInvalid'));
      setResult(null);
      return;
    }
    const periodDays = orbitalPeriodDays(radius, central.mu);
    const speedKmS = orbitalSpeedKmS(radius, central.mu);
    const escapeKmS = escapeSpeedKmS(radius, central.mu);
    if (periodDays === null || speedKmS === null || escapeKmS === null) {
      setError(t('wsOrbitInvalid'));
      setResult(null);
      return;
    }
    setError(null);
    setResult({
      body,
      mode,
      radiusKm: radius,
      periodDays,
      speedKmS,
      escapeKmS,
      formula: `T = 2π √(a³/μ) = 2π √((${radius.toFixed(0)} km)³ / ${central.mu.toExponential(4)} km³s⁻²)`,
    });
  };

  const period = result ? formatPeriod(result.periodDays) : null;

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ws-text-3">{t('wsWorkspace')}</p>
        <h1 className="mt-1.5 flex items-center gap-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ws-text">
          <Calculator size={22} strokeWidth={1.9} aria-hidden="true" className="text-ws-accent-ink" />
          {t('wsMenuCode')}
        </h1>
        <p className="mt-2 max-w-[46rem] text-[13px] leading-relaxed text-ws-text-2">{t('wsAreaCodeDesc')}</p>
      </header>

      <section className="nova-card mt-4 p-5" aria-label={t('wsOrbitCompute')}>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            compute();
          }}
        >
          <div>
            <label htmlFor="nova-orbit-body" className="nova-field__label">
              {t('wsOrbitCentral')}
            </label>
            <select
              id="nova-orbit-body"
              className="nova-field__input"
              value={body}
              onChange={(event) => setBody(event.target.value as CentralBody)}
            >
              {(Object.keys(CENTRAL_BODIES) as CentralBody[]).map((key) => (
                <option key={key} value={key}>
                  {t(CENTRAL_BODIES[key].labelKey)}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="min-w-0">
            <legend className="nova-field__label">{t('wsOrbitMode')}</legend>
            <div className="flex gap-3 pt-1">
              {(['axis', 'altitude'] as Mode[]).map((option) => (
                <label key={option} className="flex items-center gap-1.5 text-[12.5px] text-ws-text-2">
                  <input
                    type="radio"
                    name="nova-orbit-mode"
                    value={option}
                    checked={mode === option}
                    onChange={() => setMode(option)}
                  />
                  {t(option === 'axis' ? 'wsOrbitModeAxis' : 'wsOrbitModeAltitude')}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="nova-orbit-value" className="nova-field__label">
              {t(mode === 'axis' ? 'wsOrbitA' : 'wsOrbitAltitude')}
            </label>
            <input
              id="nova-orbit-value"
              className="nova-field__input"
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>

          <div className="flex items-end">
            <button type="submit" className="nova-btn nova-btn--primary">
              <Calculator size={13} strokeWidth={2} aria-hidden="true" />
              {t('wsOrbitCompute')}
            </button>
          </div>

          {error ? (
            <p className="sm:col-span-2 text-[12px] text-ws-danger" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        {result && period ? (
          <div className="mt-4 border-t border-ws-line pt-4">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="nova-field__label">{t('wsOrbitPeriod')}</dt>
                <dd className="nova-orbit__value">
                  {period.value} {t(period.unit === 'years' ? 'wsOrbitYears' : 'wsOrbitDays')}
                </dd>
              </div>
              <div>
                <dt className="nova-field__label">{t('wsOrbitSpeed')}</dt>
                <dd className="nova-orbit__value">{result.speedKmS.toFixed(3)} km/s</dd>
              </div>
              <div>
                <dt className="nova-field__label">{t('wsOrbitEscape')}</dt>
                <dd className="nova-orbit__value">{result.escapeKmS.toFixed(3)} km/s</dd>
              </div>
            </dl>
            <p className="nova-orbit__formula">{result.formula}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ws-text-3">{t('wsOrbitNote')}</p>
            <button
              type="button"
              className="nova-btn nova-btn--secondary mt-3"
              onClick={() =>
                askNovaWithPrompt(
                  t('wsOrbitAskPrompt', {
                    body: t(CENTRAL_BODIES[result.body].labelKey),
                    radius: result.radiusKm.toFixed(0),
                    period: `${period.value} ${t(period.unit === 'years' ? 'wsOrbitYears' : 'wsOrbitDays')}`,
                    speed: result.speedKmS.toFixed(3),
                  }),
                )
              }
            >
              <MessageSquare size={12} strokeWidth={2} aria-hidden="true" />
              {t('wsModAsk')}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
