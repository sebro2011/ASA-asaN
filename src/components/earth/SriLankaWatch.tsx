/**
 * Sri Lanka Earth Watch — a focused exploration mode.
 *
 * Provides Sri Lankan study areas, suggested datasets for the island, and an
 * explicit statement of what each dataset can and cannot establish. It contains
 * no alerts, warnings or invented measurements: hazard warnings are issued by
 * Sri Lankan authorities, not by this Lab.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ExternalLink, Flame, Leaf, MapPin, Waves } from 'lucide-react';
import { InfoNote, Panel, Pill, SectionHeading, StatusBadge, formatDateTime, formatNumber } from './EarthPanel';
import { SRI_LANKA_PLACES } from '../../lib/earth/geocode';
import { getGibsLayer } from '../../lib/earth/gibsCatalog';
import { fetchCapabilities, fetchFirmsHotspots, type EarthCapabilities, type FirmsHotspots } from '../../lib/earth/capabilities';
import type { GibsLayerMeta } from '../../lib/earth/types';

export interface SriLankaArea {
  label: string;
  latitude: number;
  longitude: number;
  bounds?: [number, number, number, number];
  source: 'gazetteer' | 'search' | 'map-click' | 'preset' | 'custom';
}

interface SriLankaWatchProps {
  area: { label: string; latitude: number; longitude: number; bounds?: [number, number, number, number] };
  layer: GibsLayerMeta;
  date: string;
  compareDate?: string | null;
  onSelectArea: (area: SriLankaArea) => void;
  onSelectLayer: (layerId: string) => void;
  onSetDate: (date: string, which: 'primary' | 'compare') => void;
}

const SUGGESTED_LAYERS = [
  'MODIS_Terra_CorrectedReflectance_TrueColor',
  'VIIRS_SNPP_CorrectedReflectance_TrueColor',
  'MODIS_Terra_NDVI_8Day',
  'MODIS_Terra_L2_Chlorophyll_A',
  'GHRSST_L4_MUR_Sea_Surface_Temperature',
  'IMERG_Precipitation_Rate',
  'MODIS_Combined_Flood_2-Day',
  'VIIRS_SNPP_Thermal_Anomalies_375m_All'
];

export default function SriLankaWatch({ area, layer, date, compareDate, onSelectArea, onSelectLayer, onSetDate }: SriLankaWatchProps) {
  const { t } = useTranslation();
  const [capabilities, setCapabilities] = useState<EarthCapabilities | null>(null);
  const [hotspots, setHotspots] = useState<FirmsHotspots | null>(null);
  const [loadingHotspots, setLoadingHotspots] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchCapabilities(controller.signal)
      .then((result) => setCapabilities(result))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!capabilities?.firmsHotspots) return undefined;
    const controller = new AbortController();
    setLoadingHotspots(true);
    fetchFirmsHotspots(
      { west: 79.4, south: 5.8, east: 82.0, north: 10.0, date, dayRange: 1, source: 'VIIRS_SNPP_NRT' },
      controller.signal
    )
      .then((result) => setHotspots(result))
      .catch(() => undefined)
      .finally(() => setLoadingHotspots(false));
    return () => controller.abort();
  }, [capabilities?.firmsHotspots, date]);

  const sameDayLastYear = React.useMemo(() => {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setUTCFullYear(parsed.getUTCFullYear() - 1);
    return parsed.toISOString().slice(0, 10);
  }, [date]);

  return (
    <div className="space-y-4">
      <Panel className="space-y-3 border-lime-500/25 bg-gradient-to-br from-lime-950/30 via-slate-950 to-cyan-950/20">
        <SectionHeading
          icon={Leaf}
          title={t('earthSriLankaTitle')}
          subtitle={t('earthSriLankaIntro')}
          badge={<Pill tone="lime">NASA GIBS · NASA POWER</Pill>}
        />
        <InfoNote tone="amber">{t('earthSriLankaCaution')}</InfoNote>
      </Panel>

      <Panel className="space-y-3">
        <SectionHeading icon={MapPin} title={t('earthSriLankaPlaces')} subtitle={`${SRI_LANKA_PLACES.length} curated locations (island, districts, forests, coast)`} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SRI_LANKA_PLACES.map((place) => {
            const active = Math.abs(place.latitude - area.latitude) < 0.02 && Math.abs(place.longitude - area.longitude) < 0.02;
            return (
              <button
                key={place.name}
                type="button"
                onClick={() =>
                  onSelectArea({
                    label: place.name,
                    latitude: place.latitude,
                    longitude: place.longitude,
                    bounds: place.bounds,
                    source: 'gazetteer'
                  })
                }
                aria-pressed={active}
                className={`rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400 ${
                  active
                    ? 'border-lime-400/70 bg-lime-500/10 shadow-[0_0_18px_rgba(132,204,22,0.18)]'
                    : 'border-slate-700 bg-slate-950/70 hover:border-cyan-500/50'
                }`}
              >
                <p className="text-sm font-semibold text-white">{place.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{place.region}</p>
                <p className="mt-1 font-mono text-[10px] text-slate-500">
                  {place.latitude.toFixed(3)}°, {place.longitude.toFixed(3)}°
                </p>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel className="space-y-3">
        <SectionHeading
          icon={Waves}
          title={t('earthSriLankaQuickLayers')}
          subtitle={t('earthSriLankaMonsoon')}
        />
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_LAYERS.map((id) => {
            const meta = getGibsLayer(id);
            if (!meta) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectLayer(id)}
                aria-pressed={layer.id === id}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400 ${
                  layer.id === id
                    ? 'border-lime-400/70 bg-lime-500/15 text-lime-100'
                    : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-lime-500/50 hover:text-white'
                }`}
              >
                {meta.title}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{t('earthDatasetAppropriateFor')}</p>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
              {layer.appropriateFor.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-amber-500/25 bg-amber-950/10 p-3">
            <p className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-amber-300/80">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('earthDatasetLimitations')}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-amber-100">{layer.limitations}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">{t('earthViewSideBySide')}:</span>
          <button
            type="button"
            onClick={() => sameDayLastYear && onSetDate(sameDayLastYear, 'compare')}
            disabled={!sameDayLastYear}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
          >
            {sameDayLastYear ? `${t('earthComparisonDate')}: ${sameDayLastYear}` : t('earthComparisonDate')}
          </button>
          <span className="font-mono text-[11px] text-slate-500">
            {date}
            {compareDate ? ` ↔ ${compareDate}` : ''}
          </span>
        </div>
      </Panel>

      <Panel className="space-y-3">
        <SectionHeading
          icon={Flame}
          title={t('earthFirmsTitle')}
          subtitle="NASA FIRMS area API — only queried when the deployment configures a MAP_KEY."
          badge={
            capabilities ? (
              <StatusBadge status={capabilities.firmsHotspots ? 'live' : 'not-configured'} />
            ) : (
              <StatusBadge status="unavailable" />
            )
          }
        />
        {!capabilities || !capabilities.firmsHotspots ? (
          <InfoNote tone="amber">
            {t('earthFirmsNotConfigured')}{' '}
            <a href="https://firms.modaps.eosdis.nasa.gov/api/area/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 underline decoration-dotted">
              {t('earthFirmsDocs')} <ExternalLink className="h-3 w-3" />
            </a>
          </InfoNote>
        ) : loadingHotspots ? (
          <p className="text-xs text-slate-400">Querying NASA FIRMS…</p>
        ) : hotspots && hotspots.ok ? (
          <div className="space-y-2">
            <p className="text-sm text-white">{t('earthFirmsCount', { count: hotspots.detectionCount ?? 0 })}</p>
            <p className="text-xs text-slate-300">
              {t('earthFirmsMeanFrp', { value: hotspots.meanFrp === null || hotspots.meanFrp === undefined ? '—' : formatNumber(hotspots.meanFrp, 1) })}
            </p>
            {hotspots.byDay ? (
              <div className="text-xs text-slate-400">
                <span className="text-slate-500">{t('earthFirmsByDay')}: </span>
                {Object.entries(hotspots.byDay)
                  .map(([day, count]) => `${day}: ${count}`)
                  .join(' · ')}
              </div>
            ) : null}
            {hotspots.retrievedAt ? (
              <p className="text-[11px] text-slate-500">
                {t('earthProvenanceRetrieved')}: {formatDateTime(hotspots.retrievedAt)}
                {hotspots.attribution ? ` · ${hotspots.attribution}` : ''}
              </p>
            ) : null}
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{t('earthFirmsLimitations')}</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-300">
                {(hotspots.limitations || []).map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <InfoNote tone="amber">{hotspots?.message || t('earthFirmsNotConfigured')}</InfoNote>
        )}
      </Panel>
    </div>
  );
}
