/**
 * COSMORA Multi-Agency Space Apps Hydro-Climate & Satellite Research Hub.
 *
 * Clearly distinguishes Official NASA sources, Partner Space & Climate Agencies
 * (NOAA NCEI, CSA / NASA / CNES SWOT), and International Research Institutions
 * (KNMI Climate Explorer), enforces honest capability reporting, surfaces
 * dataset attribution / units / coverage / retrieval timestamps, and runs
 * validated Mann–Kendall, Seasonal Mann–Kendall, Pettitt, and Bretherton
 * autocorrelation-adjusted cross-correlation tests on retrieved or imported series.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Globe2,
  Layers,
  Radar,
  ShieldCheck,
  Upload
} from 'lucide-react';
import {
  Button,
  Metric,
  Panel,
  PanelHeader,
  cx
} from '../../ui/primitives';
import { ChartFrame } from '../../ui/ChartFrame';
import { downloadTextFile } from '../../lib/earth/context';
import { parameterMeta } from '../../lib/earth/power';
import { STATISTICS_CONFIG } from '../../lib/earth/statisticsConfig';
import {
  SPACE_APPS_RESOURCE_MATRIX,
  analyzeExternalSeries,
  buildAppeearsPointTaskSpec,
  buildGesDiscDataRodUrl,
  buildGiovanniDeepLink,
  parseExternalTimeSeriesCsv,
  parseGesDiscAsc2,
  parseKnmiAsciiSeries,
  type AgencyCategory,
  type ExternalMonthlySeries,
  type SwotDiscoveryResult
} from '../../lib/earth/spaceAppsResources';
import type { BoundingBox, PowerDataset, Provenance } from '../../lib/earth/types';

export interface MultiSourceResearchHubProps {
  areaLabel: string;
  latitude: number;
  longitude: number;
  bbox: BoundingBox;
  powerDataset: PowerDataset | null;
  reducedMotion: boolean;
  onExternalProvenance?: (entry: Provenance) => void;
}

const AXIS = '#8294ad';
const GRID = 'rgba(148,178,214,0.14)';

function agencyBadgeStyle(category: AgencyCategory): string {
  switch (category) {
    case 'nasa':
      return 'border-cyan-400/45 bg-cyan-500/10 text-cyan-200';
    case 'partner-agency':
      return 'border-emerald-400/45 bg-emerald-500/10 text-emerald-200';
    case 'research-institution':
      return 'border-violet-400/45 bg-violet-500/10 text-violet-200';
    default:
      return 'border-line text-ink-3';
  }
}

function agencyCategoryLabel(category: AgencyCategory): string {
  switch (category) {
    case 'nasa':
      return 'Official NASA Source';
    case 'partner-agency':
      return 'Partner Space / Climate Agency';
    case 'research-institution':
      return 'International Research Institution';
    default:
      return 'Community Open Data';
  }
}

function formatSigned(val: number, digits = 3): string {
  const s = val.toFixed(digits);
  return val > 0 ? `+${s}` : s;
}

export default function MultiSourceResearchHub({
  areaLabel,
  latitude,
  longitude,
  bbox,
  powerDataset,
  reducedMotion,
  onExternalProvenance
}: MultiSourceResearchHubProps) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | AgencyCategory>('all');
  const [serverCaps, setServerCaps] = useState<{
    noaaCdoConfigured: boolean;
    gesDiscEarthdataConfigured: boolean;
  }>({ noaaCdoConfigured: false, gesDiscEarthdataConfigured: false });

  // SWOT CMR Live Discovery state
  const [swotCollection, setSwotCollection] = useState<string>('SWOT_L2_LR_SSH_Basic_2.0');
  const [swotLoading, setSwotLoading] = useState(false);
  const [swotError, setSwotError] = useState<string | null>(null);
  const [swotResult, setSwotResult] = useState<SwotDiscoveryResult | null>(null);

  // External / Partner Time-Series state (NOAA CDO, GES DISC, KNMI, Giovanni/AppEEARS CSV)
  const [noaaDatatype, setNoaaDatatype] = useState<'TAVG' | 'TMAX' | 'TMIN' | 'PRCP'>('TAVG');
  const [gesVariable, setGesVariable] = useState<string>('SoilMoi0_10cm_inst');
  const [knmiIndexId, setKnmiIndexId] = useState<'nino34' | 'dmi'>('dmi');
  const [giovanniVar, setGiovanniVar] = useState<string>('GPM_3IMERGDF_07_precipitation');

  const [connectorLoading, setConnectorLoading] = useState<string | null>(null);
  const [connectorNotice, setConnectorNotice] = useState<{ tone: 'info' | 'warn'; text: string; url?: string } | null>(
    null
  );
  const [activeExternalSeries, setActiveExternalSeries] = useState<ExternalMonthlySeries | null>(null);
  const [comparePowerCode, setComparePowerCode] = useState<string>('PRECTOTCORR');
  const [pasteBuffer, setPasteBuffer] = useState<string>('');
  const [importFormat, setImportFormat] = useState<'auto-csv' | 'knmi-dat' | 'gesdisc-asc2'>('auto-csv');

  const startYear = powerDataset?.startYear ?? 2005;
  const endYear = powerDataset?.endYear ?? 2024;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/earth/sources', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { serverCapabilities?: { noaaCdoConfigured?: boolean; gesDiscEarthdataConfigured?: boolean } } | null) => {
        if (!cancelled && body?.serverCapabilities) {
          setServerCaps({
            noaaCdoConfigured: Boolean(body.serverCapabilities.noaaCdoConfigured),
            gesDiscEarthdataConfigured: Boolean(body.serverCapabilities.gesDiscEarthdataConfigured)
          });
        }
      })
      .catch(() => {
        // Static deployment without /api/earth/sources keeps conservative false flags.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredResources = useMemo(
    () =>
      categoryFilter === 'all'
        ? SPACE_APPS_RESOURCE_MATRIX
        : SPACE_APPS_RESOURCE_MATRIX.filter((r) => r.agencyCategory === categoryFilter),
    [categoryFilter]
  );

  const registerSeries = useCallback(
    (series: ExternalMonthlySeries) => {
      setActiveExternalSeries(series);
      if (onExternalProvenance) {
        onExternalProvenance({
          dataset: series.title,
          datasetId: series.id,
          provider: series.agencyLabel,
          sourceUrl: series.sourceUrl,
          retrievedAt: series.retrievedAt,
          coverage:
            series.coverageStart && series.coverageEnd
              ? `${series.coverageStart} → ${series.coverageEnd}`
              : undefined,
          resolution: series.spatialNote,
          note: `${agencyCategoryLabel(series.agencyCategory)} · Units: ${series.unit}`
        });
      }
    },
    [onExternalProvenance]
  );

  const handleFetchSwot = useCallback(async () => {
    setSwotLoading(true);
    setSwotError(null);
    try {
      const params = new URLSearchParams({
        west: String(bbox.west),
        south: String(bbox.south),
        east: String(bbox.east),
        north: String(bbox.north),
        collection: swotCollection
      });
      const resp = await fetch(`/api/earth/swot/granules?${params.toString()}`, {
        headers: { Accept: 'application/json' }
      });
      const body = (await resp.json()) as SwotDiscoveryResult & { ok?: boolean; message?: string };
      if (!resp.ok || !body.ok) {
        setSwotError(body.message || `SWOT granule lookup returned HTTP ${resp.status}.`);
        return;
      }
      setSwotResult(body);
      if (onExternalProvenance) {
        onExternalProvenance({
          dataset: `SWOT CMR Granules (${body.collection})`,
          datasetId: body.collection,
          provider: 'Partner Mission · CSA / NASA / CNES / UKSA (PO.DAAC CMR)',
          sourceUrl: body.sourceUrl,
          retrievedAt: body.retrievedAt,
          coverage: `${body.totalHits} matching passes`,
          resolution: `[${bbox.west}, ${bbox.south}, ${bbox.east}, ${bbox.north}]`,
          note: body.agencyAttribution
        });
      }
    } catch {
      setSwotError('Unable to reach SWOT NASA CMR endpoint from this environment.');
    } finally {
      setSwotLoading(false);
    }
  }, [bbox, swotCollection, onExternalProvenance]);

  const handleFetchNoaa = useCallback(async () => {
    setConnectorLoading('noaa');
    setConnectorNotice(null);
    try {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        start: String(startYear),
        end: String(endYear),
        datatype: noaaDatatype
      });
      const resp = await fetch(`/api/earth/noaa/cdo?${params.toString()}`, {
        headers: { Accept: 'application/json' }
      });
      const body = (await resp.json()) as {
        ok?: boolean;
        message?: string;
        series?: ExternalMonthlySeries;
      };
      if (!resp.ok || !body.ok || !body.series) {
        setConnectorNotice({
          tone: 'warn',
          text:
            body.message ||
            'NOAA CDO live query requires a server NOAA_CDO_TOKEN. You can import an exported NOAA CDO CSV below at any time.'
        });
        return;
      }
      registerSeries(body.series);
      setConnectorNotice({
        tone: 'info',
        text: `Loaded ${body.series.points.length} monthly gauge records from ${body.series.title}.`
      });
    } catch {
      setConnectorNotice({
        tone: 'warn',
        text: 'NOAA CDO proxy unreachable — import a NOAA station CSV below for offline analysis.'
      });
    } finally {
      setConnectorLoading(null);
    }
  }, [latitude, longitude, startYear, endYear, noaaDatatype, registerSeries]);

  const handleFetchGesDisc = useCallback(async () => {
    setConnectorLoading('gesdisc');
    setConnectorNotice(null);
    try {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        start: String(Math.max(2000, startYear)),
        end: String(endYear),
        variable: gesVariable
      });
      const resp = await fetch(`/api/earth/hydrology/gesdisc?${params.toString()}`, {
        headers: { Accept: 'application/json' }
      });
      const body = (await resp.json()) as {
        ok?: boolean;
        message?: string;
        rodUrl?: string;
        series?: ExternalMonthlySeries;
      };
      if (!resp.ok || !body.ok || !body.series) {
        setConnectorNotice({
          tone: 'warn',
          text:
            body.message ||
            'GES DISC Data Rods require NASA Earthdata authentication. Open the direct Data Rod URL or import an asc2 file below.',
          url: body.rodUrl
        });
        return;
      }
      registerSeries(body.series);
      setConnectorNotice({
        tone: 'info',
        text: `Loaded ${body.series.points.length} monthly hydrological rod points from NASA GES DISC.`
      });
    } catch {
      setConnectorNotice({
        tone: 'warn',
        text: 'GES DISC proxy unreachable — use the Data Rod URL or import an asc2 file below.'
      });
    } finally {
      setConnectorLoading(null);
    }
  }, [latitude, longitude, startYear, endYear, gesVariable, registerSeries]);

  const handleFetchKnmi = useCallback(async () => {
    setConnectorLoading('knmi');
    setConnectorNotice(null);
    try {
      const resp = await fetch(`/api/earth/knmi/index?id=${knmiIndexId}`, {
        headers: { Accept: 'application/json' }
      });
      const body = (await resp.json()) as {
        ok?: boolean;
        message?: string;
        series?: ExternalMonthlySeries;
      };
      if (!resp.ok || !body.ok || !body.series) {
        setConnectorNotice({
          tone: 'warn',
          text:
            body.message ||
            'KNMI static index is unreachable in this network sandbox. Paste or upload a KNMI .dat file below to analyze locally.'
        });
        return;
      }
      registerSeries(body.series);
      setConnectorNotice({
        tone: 'info',
        text: `Loaded ${body.series.points.length} monthly values from ${body.series.title}.`
      });
    } catch {
      setConnectorNotice({
        tone: 'warn',
        text: 'KNMI Climate Explorer static file unreachable in this sandbox — paste or upload any KNMI .dat file below.'
      });
    } finally {
      setConnectorLoading(null);
    }
  }, [knmiIndexId, registerSeries]);

  const handleParseText = useCallback(
    (rawText: string, formatHint: 'auto-csv' | 'knmi-dat' | 'gesdisc-asc2') => {
      try {
        let parsed: ExternalMonthlySeries;
        if (formatHint === 'knmi-dat') {
          parsed = parseKnmiAsciiSeries(rawText);
        } else if (formatHint === 'gesdisc-asc2') {
          parsed = parseGesDiscAsc2(rawText, { latitude, longitude });
        } else {
          // Auto-detect asc2 or KNMI .dat if no commas exist
          if (/param_short_name=|GLDAS|NLDAS/i.test(rawText)) {
            parsed = parseGesDiscAsc2(rawText, { latitude, longitude });
          } else if (!rawText.includes(',') && /^\s*\d{4}\s+[-+\d.]/m.test(rawText)) {
            parsed = parseKnmiAsciiSeries(rawText);
          } else {
            parsed = parseExternalTimeSeriesCsv(rawText);
          }
        }
        if (!parsed.points.length) {
          setConnectorNotice({
            tone: 'warn',
            text: 'No valid finite monthly observations were found after filtering missing/fill flags.'
          });
          return;
        }
        registerSeries(parsed);
        setConnectorNotice({
          tone: 'info',
          text: `Imported "${parsed.title}" (${parsed.points.length} monthly points, ${parsed.coverageStart} → ${parsed.coverageEnd}).`
        });
      } catch (err) {
        setConnectorNotice({
          tone: 'warn',
          text: err instanceof Error ? err.message : 'Unable to parse external time-series file.'
        });
      }
    },
    [latitude, longitude, registerSeries]
  );

  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const name = file.name.toLowerCase();
      const formatHint: 'auto-csv' | 'knmi-dat' | 'gesdisc-asc2' = name.endsWith('.dat')
        ? 'knmi-dat'
        : name.endsWith('.asc') || name.endsWith('.asc2')
          ? 'gesdisc-asc2'
          : importFormat;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleParseText(reader.result, formatHint);
        }
      };
      reader.readAsText(file);
    },
    [importFormat, handleParseText]
  );

  const giovanniUrl = useMemo(
    () => buildGiovanniDeepLink({ bbox, startYear, endYear, dataField: giovanniVar }),
    [bbox, startYear, endYear, giovanniVar]
  );

  const gesRodDirectUrl = useMemo(
    () =>
      buildGesDiscDataRodUrl({
        latitude,
        longitude,
        startYear: Math.max(2000, startYear),
        endYear,
        variable: `GLDAS2:GLDAS_NOAH025_M_v2.1:${gesVariable}`
      }),
    [latitude, longitude, startYear, endYear, gesVariable]
  );

  const handleDownloadAppeearsSpec = useCallback(() => {
    const spec = buildAppeearsPointTaskSpec({
      label: areaLabel,
      latitude,
      longitude,
      startYear,
      endYear
    });
    downloadTextFile(
      `cosmora-appeears-point-task-${startYear}-${endYear}.json`,
      JSON.stringify(spec, null, 2),
      'application/json'
    );
  }, [areaLabel, latitude, longitude, startYear, endYear]);

  const externalAnalysis = useMemo(
    () =>
      activeExternalSeries
        ? analyzeExternalSeries(activeExternalSeries, powerDataset, comparePowerCode)
        : null,
    [activeExternalSeries, powerDataset, comparePowerCode]
  );

  return (
    <div className="space-y-6">
      {/* 1. Multi-Agency Source Evaluation & Taxonomy Header */}
      <Panel className="earth-glass-panel space-y-4">
        <PanelHeader
          eyebrow="Space Apps Earth Science Resource Architecture"
          title="Multi-Agency Climate, Hydrology & Satellite Research Hub"
          description="Transparent evaluation and live/workflow connectors across Official NASA DAACs, Partner Space & Meteorological Agencies (NOAA, CSA/CNES SWOT), and International Climate Research Portals (KNMI)."
          icon={Globe2}
          actions={
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter data sources by agency category">
              {(
                [
                  { id: 'all', label: 'All (7)' },
                  { id: 'nasa', label: 'NASA Official (4)' },
                  { id: 'partner-agency', label: 'Partner Agencies (2)' },
                  { id: 'research-institution', label: 'Research Portals (1)' }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={categoryFilter === tab.id}
                  onClick={() => setCategoryFilter(tab.id)}
                  className={cx(
                    'rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition',
                    categoryFilter === tab.id
                      ? 'border-atmo bg-atmo/15 text-ink'
                      : 'border-line/70 bg-abyss/50 text-ink-3 hover:text-ink'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          }
        />

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {filteredResources.map((res) => {
            const tokenLive =
              (res.id === 'noaa-cdo' && serverCaps.noaaCdoConfigured) ||
              (res.id === 'nasa-hydrology-rods' && serverCaps.gesDiscEarthdataConfigured);
            return (
              <div
                key={res.id}
                className="flex flex-col justify-between rounded-[12px] border border-line/70 bg-abyss/55 p-4 space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className={cx('chip text-[9.5px]', agencyBadgeStyle(res.agencyCategory))}>
                      {agencyCategoryLabel(res.agencyCategory)}
                    </span>
                    <span
                      className={cx(
                        'chip text-[9.5px]',
                        res.integrationMode === 'live-keyless-api' || tokenLive
                          ? 'border-signal/45 bg-signal/10 text-signal'
                          : 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                      )}
                    >
                      {res.integrationMode === 'live-keyless-api'
                        ? 'Live Keyless API'
                        : tokenLive
                          ? 'Server Token Active'
                          : res.integrationMode === 'live-token-api'
                            ? 'Token Proxy + File Import'
                            : 'Portal Link + File Import'}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-ink">{res.name}</h3>
                    <p className="font-mono text-[10px] text-atmo">{res.agencyLabel}</p>
                  </div>

                  <p className="text-[11.5px] leading-relaxed text-ink-2">{res.usableApiSummary}</p>

                  <dl className="space-y-1 border-t border-line/50 pt-2 text-[10.5px]">
                    <div>
                      <dt className="inline font-semibold text-ink-3">Coverage: </dt>
                      <dd className="inline font-mono text-ink-2">{res.spatialTemporalCoverage}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-ink-3">Auth &amp; Rate Policy: </dt>
                      <dd className="inline text-ink-3">{res.rateLimitPolicy}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-ink-3">Variables &amp; Units: </dt>
                      <dd className="inline font-mono text-ink-2">{res.primaryVariables.slice(0, 3).join(' · ')}</dd>
                    </div>
                  </dl>
                </div>

                <div className="flex items-center justify-between border-t border-line/40 pt-2.5">
                  <span className="text-[10px] text-ink-4">{res.limitationsNote.slice(0, 68)}…</span>
                  <a
                    href={res.officialUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] text-atmo hover:underline"
                  >
                    Portal <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* 2. Live Connectors Row: CSA/NASA SWOT CMR + Partner/Hydrology Connectors */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* CSA / NASA / CNES SWOT Live Satellite Granule Discovery */}
        <Panel className="earth-glass-panel space-y-4">
          <PanelHeader
            eyebrow="Partner Agency Mission · CSA / NASA / CNES / UKSA"
            title="SWOT Surface Water & Ocean Topography Pass Discovery"
            description={`Keyless live NASA CMR granule search over active study box [${bbox.west.toFixed(2)}°, ${bbox.south.toFixed(2)}°, ${bbox.east.toFixed(2)}°, ${bbox.north.toFixed(2)}°].`}
            icon={Radar}
            actions={
              <span className="chip border-emerald-400/45 bg-emerald-500/10 text-emerald-200">
                CSA · NASA · CNES
              </span>
            }
          />

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[200px] space-y-1">
              <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                SWOT KaRIn Science Collection
              </span>
              <select
                aria-label="SWOT KaRIn Science Collection"
                value={swotCollection}
                onChange={(e) => setSwotCollection(e.target.value)}
                className="w-full rounded-[9px] border border-line bg-abyss/80 px-3 py-2 font-mono text-xs text-ink"
              >
                <option value="SWOT_L2_LR_SSH_Basic_2.0">SWOT_L2_LR_SSH_Basic_2.0 (Ocean &amp; Coastal SSH)</option>
                <option value="SWOT_L2_HR_LakeSP_2.0">SWOT_L2_HR_LakeSP_2.0 (Inland Lakes &amp; Reservoirs)</option>
                <option value="SWOT_L2_HR_RiverSP_2.0">SWOT_L2_HR_RiverSP_2.0 (River Reaches &amp; Discharge)</option>
              </select>
            </label>
            <Button variant="primary" size="sm" onClick={handleFetchSwot} disabled={swotLoading}>
              {swotLoading ? 'Searching CMR…' : 'Query SWOT Passes'}
            </Button>
          </div>

          {swotError ? (
            <p className="rounded-[9px] border border-caution/40 bg-caution/10 px-3 py-2 text-xs text-caution">
              {swotError}
            </p>
          ) : null}

          {swotResult ? (
            <div className="space-y-3 rounded-[11px] border border-line/70 bg-abyss/50 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-mono text-emerald-200">
                  {swotResult.totalHits} matching SWOT granules · showing {swotResult.granules.length} latest
                </span>
                <span className="font-mono text-ink-4">
                  Retrieved {swotResult.retrievedAt.slice(0, 16).replace('T', ' ')}Z
                </span>
              </div>
              {swotResult.granules.length > 0 ? (
                <div className="max-h-52 overflow-y-auto">
                  <table className="earth-data-table text-left text-[11px]">
                    <thead>
                      <tr>
                        <th scope="col">Granule / Orbit</th>
                        <th scope="col">Observation Start (UTC)</th>
                        <th scope="col">Cycle / Pass</th>
                      </tr>
                    </thead>
                    <tbody>
                      {swotResult.granules.slice(0, 8).map((g) => (
                        <tr key={g.id}>
                          <td className="font-mono text-[10.5px] text-ink">
                            {g.downloadUrl ? (
                              <a
                                href={g.downloadUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-atmo underline decoration-dotted"
                              >
                                {g.title.slice(0, 34)}…
                              </a>
                            ) : (
                              g.title.slice(0, 36)
                            )}
                          </td>
                          <td className="font-mono text-ink-2">{g.timeStart.slice(0, 16).replace('T', ' ')}Z</td>
                          <td className="font-mono text-ink-3">
                            {g.cycleNumber !== null && g.passNumber !== null
                              ? `C${String(g.cycleNumber).padStart(3, '0')} · P${String(g.passNumber).padStart(3, '0')}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-ink-3">
                  Zero granules returned for this bounding box and collection. Try widening the study area or switching between LakeSP / RiverSP / SSH.
                </p>
              )}
              <p className="text-[10.5px] text-ink-3">
                {swotResult.agencyAttribution} ·{' '}
                <a
                  href={swotResult.csaReferenceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-atmo underline decoration-dotted"
                >
                  CSA SWOT Mission Reference
                </a>
              </p>
            </div>
          ) : (
            <p className="text-[11.5px] text-ink-3">
              Canadian Space Agency (CSA) contributed the high-power Extended Interaction Klystron (EIK) for SWOT&apos;s KaRIn radar interferometer. Query NASA CMR above to inspect verified satellite passes over {areaLabel}.
            </p>
          )}
        </Panel>

        {/* NOAA CDO, GES DISC Hydrology Rods, KNMI & NASA Giovanni/AppEEARS Workflows */}
        <Panel className="earth-glass-panel space-y-4">
          <PanelHeader
            eyebrow="Station Gauges, Hydrology Data Rods & Portal Handoffs"
            title={`Multi-Source Connectors for ${areaLabel} (${startYear}–${endYear})`}
            description="Fetch live partner/hydrology series when server tokens are present, or launch pre-parameterized NASA Giovanni / AppEEARS / GES DISC workflows."
            icon={Layers}
          />

          <div className="space-y-3 text-xs">
            {/* NOAA CDO */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line/60 bg-abyss/50 p-3">
              <div className="space-y-0.5">
                <span className="font-mono text-[10px] text-emerald-300">Partner Agency · NOAA NCEI CDO v2 (GSOM)</span>
                <p className="text-[11.5px] text-ink-2">Nearest WMO weather station monthly gauge series</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="NOAA CDO station parameter"
                  value={noaaDatatype}
                  onChange={(e) => setNoaaDatatype(e.target.value as 'TAVG' | 'TMAX' | 'TMIN' | 'PRCP')}
                  className="rounded-[8px] border border-line bg-abyss px-2 py-1.5 font-mono text-[11px] text-ink"
                >
                  <option value="TAVG">TAVG (°C)</option>
                  <option value="PRCP">PRCP (mm/mo)</option>
                  <option value="TMAX">TMAX (°C)</option>
                  <option value="TMIN">TMIN (°C)</option>
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleFetchNoaa}
                  disabled={connectorLoading === 'noaa'}
                >
                  {connectorLoading === 'noaa' ? 'Loading…' : 'Query NOAA'}
                </Button>
              </div>
            </div>

            {/* NASA GES DISC Hydrology Data Rods */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line/60 bg-abyss/50 p-3">
              <div className="space-y-0.5">
                <span className="font-mono text-[10px] text-cyan-300">Official NASA · GES DISC Hydrology Data Rods</span>
                <p className="text-[11.5px] text-ink-2">GLDAS-2.1 0.25° soil moisture, surface runoff &amp; evapotranspiration</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="NASA GES DISC Hydrology variable"
                  value={gesVariable}
                  onChange={(e) => setGesVariable(e.target.value)}
                  className="rounded-[8px] border border-line bg-abyss px-2 py-1.5 font-mono text-[11px] text-ink"
                >
                  <option value="SoilMoi0_10cm_inst">SoilMoi 0–10cm (kg/m²)</option>
                  <option value="Qs_acc">Surface Runoff Qs (kg/m²)</option>
                  <option value="Evap_tavg">Evapotranspiration (kg/m²/s)</option>
                  <option value="Rainf_f_tavg">GLDAS Rain Rate (kg/m²/s)</option>
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleFetchGesDisc}
                  disabled={connectorLoading === 'gesdisc'}
                >
                  {connectorLoading === 'gesdisc' ? 'Loading…' : 'Fetch Rod'}
                </Button>
                <a
                  href={gesRodDirectUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono text-[10.5px] text-atmo underline decoration-dotted"
                >
                  asc2 URL
                </a>
              </div>
            </div>

            {/* KNMI Climate Explorer Teleconnections */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line/60 bg-abyss/50 p-3">
              <div className="space-y-0.5">
                <span className="font-mono text-[10px] text-violet-300">Research Institution · KNMI Climate Explorer</span>
                <p className="text-[11.5px] text-ink-2">ENSO &amp; Indian Ocean Dipole teleconnection indices (.dat)</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="KNMI teleconnection index"
                  value={knmiIndexId}
                  onChange={(e) => setKnmiIndexId(e.target.value as 'nino34' | 'dmi')}
                  className="rounded-[8px] border border-line bg-abyss px-2 py-1.5 font-mono text-[11px] text-ink"
                >
                  <option value="dmi">Indian Ocean Dipole (DMI °C)</option>
                  <option value="nino34">ENSO Niño 3.4 (°C)</option>
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleFetchKnmi}
                  disabled={connectorLoading === 'knmi'}
                >
                  {connectorLoading === 'knmi' ? 'Loading…' : 'Fetch KNMI'}
                </Button>
              </div>
            </div>

            {/* NASA Giovanni & NASA AppEEARS Validated Portal Workflows */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line/60 bg-abyss/50 p-3">
              <div className="space-y-0.5">
                <span className="font-mono text-[10px] text-cyan-300">
                  Official NASA Portals · Giovanni &amp; LP DAAC AppEEARS
                </span>
                <p className="text-[11.5px] text-ink-2">
                  Earthdata-authenticated portals — launch exact study area or export API v1 task JSON
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="NASA Giovanni variable"
                  value={giovanniVar}
                  onChange={(e) => setGiovanniVar(e.target.value)}
                  className="rounded-[8px] border border-line bg-abyss px-2 py-1.5 font-mono text-[11px] text-ink"
                >
                  <option value="GPM_3IMERGDF_07_precipitation">GPM IMERG Precipitation</option>
                  <option value="M2TMNXSLV_5_12_4_T2M">MERRA-2 2m Air Temp</option>
                  <option value="GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst">GLDAS 0–10cm Soil Moisture</option>
                </select>
                <a
                  href={giovanniUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 rounded-[8px] border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1.5 font-mono text-[11px] text-cyan-200 hover:bg-cyan-500/20"
                >
                  Open Giovanni <ExternalLink className="h-3 w-3" />
                </a>
                <Button variant="ghost" size="sm" onClick={handleDownloadAppeearsSpec}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  AppEEARS Task JSON
                </Button>
              </div>
            </div>
          </div>

          {connectorNotice ? (
            <div
              className={cx(
                'rounded-[10px] border px-3.5 py-2.5 text-xs',
                connectorNotice.tone === 'info'
                  ? 'border-signal/40 bg-signal/10 text-signal'
                  : 'border-amber-400/40 bg-amber-500/10 text-amber-100'
              )}
            >
              <span>{connectorNotice.text}</span>
              {connectorNotice.url ? (
                <>
                  {' '}
                  <a
                    href={connectorNotice.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-mono underline"
                  >
                    Open Direct URL
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>

      {/* 3. Universal Multi-Agency CSV / .dat / asc2 Importer */}
      <Panel className="earth-glass-panel space-y-4">
        <PanelHeader
          eyebrow="Native Format Ingestion (Zero Mock Data)"
          title="Import Giovanni CSV · AppEEARS CSV · NOAA CDO CSV · GES DISC asc2 · KNMI .dat"
          description="Upload or paste real exported series from any Space Apps resource to run Hamed–Rao Mann–Kendall, Seasonal Mann–Kendall, Pettitt change-point, and NASA POWER cross-correlation."
          icon={FileSpreadsheet}
        />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                Format Parser
              </span>
              <select
                aria-label="External time-series format parser"
                value={importFormat}
                onChange={(e) => setImportFormat(e.target.value as 'auto-csv' | 'knmi-dat' | 'gesdisc-asc2')}
                className="w-full rounded-[9px] border border-line bg-abyss/80 px-3 py-2 font-mono text-xs text-ink"
              >
                <option value="auto-csv">Auto-detect (Giovanni / AppEEARS / NOAA CSV / KNMI / asc2)</option>
                <option value="knmi-dat">KNMI Climate Explorer ASCII (.dat)</option>
                <option value="gesdisc-asc2">NASA GES DISC Data Rod (asc2)</option>
              </select>
            </label>

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed border-atmo/50 bg-atmo/5 px-4 py-3 font-mono text-xs text-atmo hover:bg-atmo/10">
              <Upload className="h-4 w-4" />
              <span>Select .csv, .dat, or .asc2 file</span>
              <input
                type="file"
                accept=".csv,.dat,.txt,.asc,.asc2"
                aria-label="Upload external climate or hydrology data file"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>
          </div>

          <div className="lg:col-span-2 space-y-2">
            <label htmlFor="earth-external-paste" className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              Or paste raw Giovanni / AppEEARS / NOAA CSV, GES DISC asc2, or KNMI 12-month .dat rows
            </label>
            <textarea
              id="earth-external-paste"
              rows={3}
              value={pasteBuffer}
              onChange={(e) => setPasteBuffer(e.target.value)}
              placeholder="Example: Date,PRCP or KNMI 13-column rows (YYYY m1 m2 ... m12) or GES DISC asc2..."
              className="w-full rounded-[10px] border border-line bg-abyss/80 p-2.5 font-mono text-xs text-ink placeholder:text-ink-4"
            />
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                disabled={!pasteBuffer.trim()}
                onClick={() => handleParseText(pasteBuffer, importFormat)}
              >
                Parse &amp; Run Validated Statistical Tests
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      {/* 4. Active External / Partner Series Workbench & Statistical Results */}
      {externalAnalysis ? (
        <Panel className="earth-glass-panel space-y-5">
          <PanelHeader
            eyebrow={agencyCategoryLabel(externalAnalysis.series.agencyCategory)}
            title={externalAnalysis.series.title}
            description={`${externalAnalysis.series.agencyLabel} · Units: ${externalAnalysis.series.unit} · Coverage: ${externalAnalysis.series.coverageStart ?? '—'} → ${externalAnalysis.series.coverageEnd ?? '—'} · Retrieved ${externalAnalysis.series.retrievedAt.slice(0, 16).replace('T', ' ')}Z`}
            icon={Database}
            actions={
              <span className={cx('chip', agencyBadgeStyle(externalAnalysis.series.agencyCategory))}>
                {agencyCategoryLabel(externalAnalysis.series.agencyCategory)}
              </span>
            }
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="earth-kpi-card">
              <Metric
                label="Retrieved Months / Complete Yrs"
                value={`${externalAnalysis.series.points.length} / ${externalAnalysis.completeYearsCount}y`}
                note={externalAnalysis.series.spatialNote}
                size="sm"
              />
            </div>
            <div className="earth-kpi-card">
              <Metric
                label="Series Mean"
                value={externalAnalysis.mean !== null ? externalAnalysis.mean.toFixed(3) : '—'}
                unit={externalAnalysis.series.unit}
                note={
                  externalAnalysis.min && externalAnalysis.max
                    ? `Min ${externalAnalysis.min.value} (${externalAnalysis.min.date}) · Max ${externalAnalysis.max.value} (${externalAnalysis.max.date})`
                    : undefined
                }
                size="sm"
              />
            </div>
            <div className="earth-kpi-card">
              <Metric
                label="Mann–Kendall (Hamed–Rao)"
                value={
                  externalAnalysis.mannKendall.inferenceEligible
                    ? `p = ${externalAnalysis.mannKendall.pValue}`
                    : externalAnalysis.mannKendall.eligible
                      ? `n* = ${externalAnalysis.mannKendall.effectiveSampleSize} (<${STATISTICS_CONFIG.minEffectiveObservations})`
                      : `n = ${externalAnalysis.mannKendall.n} (<${STATISTICS_CONFIG.minAnnualObservations}y)`
                }
                note={
                  externalAnalysis.mannKendall.inferenceEligible &&
                  externalAnalysis.mannKendall.senSlopePerDecade !== null
                    ? `Sen: ${formatSigned(externalAnalysis.mannKendall.senSlopePerDecade)} ${externalAnalysis.series.unit}/dec (${externalAnalysis.mannKendall.direction}, α = ${STATISTICS_CONFIG.trendAlpha})`
                    : externalAnalysis.mannKendall.eligible
                      ? 'Effective sample too small after autocorrelation adjustment'
                      : `Minimum ${STATISTICS_CONFIG.minAnnualObservations} complete years required`
                }
                size="sm"
              />
            </div>
            <div className="earth-kpi-card">
              <Metric
                label={`Correlation vs POWER ${comparePowerCode}`}
                value={
                  externalAnalysis.correlationWithPower?.eligible &&
                  externalAnalysis.correlationWithPower.pearsonR !== null
                    ? `r = ${externalAnalysis.correlationWithPower.pearsonR}`
                    : '—'
                }
                note={
                  externalAnalysis.correlationWithPower?.inferenceEligible
                    ? `Spearman ρ = ${externalAnalysis.correlationWithPower.spearmanRho} · p = ${externalAnalysis.correlationWithPower.pValueAdjusted}`
                    : externalAnalysis.correlationWithPower?.eligible
                      ? `N_eff too small for a p-value (${externalAnalysis.correlationWithPower.effectiveDof} df)`
                      : 'Select overlapping NASA POWER parameter'
                }
                size="sm"
              />
            </div>
          </div>

          <ChartFrame
            height={260}
            series={[
              {
                key: 'value',
                label: `${externalAnalysis.series.variableLabel} (${externalAnalysis.series.unit})`,
                color: '#34d399'
              }
            ]}
            xLabel="Observation month (YYYY-MM)"
            yLabel={externalAnalysis.series.unit}
          >
            <LineChart
              data={externalAnalysis.series.points}
              margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
              >
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke={AXIS} tick={{ fontSize: 10 }} minTickGap={28} />
                <YAxis yAxisId={0} stroke={AXIS} tick={{ fontSize: 10 }} width={48} />
                {externalAnalysis.mean !== null ? (
                  <ReferenceLine yAxisId={0} y={externalAnalysis.mean} stroke="rgba(226,232,240,0.4)" strokeDasharray="4 4" />
                ) : null}
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const v = payload[0]?.value;
                    return (
                      <div className="rounded-[10px] border border-line bg-abyss/95 px-3 py-2 text-[11px] shadow-2xl">
                        <p className="font-mono text-atmo">{label}</p>
                        <p className="mt-1 font-mono text-ink">
                          {typeof v === 'number' ? v.toFixed(3) : String(v)} {externalAnalysis.series.unit}
                        </p>
                      </div>
                    );
                  }}
                />
                <Line
                  yAxisId={0}
                  type="monotone"
                  dataKey="value"
                  stroke="#34d399"
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={!reducedMotion}
                />
              </LineChart>
          </ChartFrame>

          {/* Statistical Hypothesis & Cross-Agency Comparison Details */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[12px] border border-line/70 bg-abyss/55 p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-atmo">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Validated Trend &amp; Change-Point Verdicts</span>
              </div>
              <p className="leading-relaxed text-ink-2">{externalAnalysis.mannKendall.interpretation}</p>
              <p className="leading-relaxed text-ink-3">{externalAnalysis.seasonalMannKendall.interpretation}</p>
              <p className="leading-relaxed text-ink-3">{externalAnalysis.pettitt.interpretation}</p>
            </div>

            <div className="rounded-[12px] border border-line/70 bg-abyss/55 p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-atmo">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Cross-Agency Comparison vs NASA POWER</span>
                </span>
                {powerDataset ? (
                  <select
                    aria-label="Compare external series against NASA POWER parameter"
                    value={comparePowerCode}
                    onChange={(e) => setComparePowerCode(e.target.value)}
                    className="rounded-[8px] border border-line bg-abyss px-2 py-1 font-mono text-[11px] text-ink"
                  >
                    {powerDataset.available.map((code) => (
                      <option key={code} value={code}>
                        POWER {code} ({parameterMeta(code)?.unit || ''})
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              <p className="leading-relaxed text-ink-2">
                {externalAnalysis.correlationWithPower
                  ? externalAnalysis.correlationWithPower.interpretation
                  : 'Load a NASA POWER series in Climate & Trends to compute autocorrelation-adjusted cross-agency correlation.'}
              </p>
              <p className="font-mono text-[10.5px] text-ink-4">
                Source Attribution: {externalAnalysis.series.agencyLabel} · {externalAnalysis.series.sourceUrl}
              </p>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
