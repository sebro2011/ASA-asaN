
import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';
import { Activity, RefreshCw, Leaf, MapPin } from 'lucide-react';

const LOCATIONS = {
  sriLanka: { name: 'Sri Lanka', lat: 6.9271, lon: 79.8612 },
  london: { name: 'London', lat: 51.5072, lon: -0.1276 },
  newYork: { name: 'New York', lat: 40.7128, lon: -74.006 }
};

export default function EarthIntelligenceLab({ lang = 'en' }) {
  const [locationKey, setLocationKey] = useState('sriLanka');
  const [metric, setMetric] = useState('T2M');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isSi = lang === 'si';
  const isTa = lang === 'ta';

  const title = isSi
    ? 'පෘථිවි බුද්ධි විද්‍යාගාරය'
    : isTa
      ? 'பூமி நுண்ணறிவு ஆய்வகம்'
      : 'Earth Intelligence Lab';

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const place = LOCATIONS[locationKey];
      const url = new URL(
        'https://power.larc.nasa.gov/api/temporal/monthly/point'
      );

      url.search = new URLSearchParams({
        parameters: 'T2M,PRECTOTCORR',
        community: 'RE',
        longitude: String(place.lon),
        latitude: String(place.lat),
        start: '2018',
        end: '2025',
        format: 'JSON'
      }).toString();

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('NASA data request failed');
      }

      const result = await response.json();
      const values = result?.properties?.parameter?.[metric];

      if (!values) {
        throw new Error('No data available');
      }

      const points = Object.entries(values)
        .filter(([key, value]) =>
          /^\d{6}$/.test(key) &&
          Number.isFinite(Number(value)) &&
          Number(value) > -900
        )
        .map(([key, value]) => ({
          date: `${key.slice(0, 4)}-${key.slice(4, 6)}`,
          year: Number(key.slice(0, 4)),
          value: Number(Number(value).toFixed(2))
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      if (!points.length) {
        throw new Error('No valid monthly observations found');
      }

      setData(points);
    } catch (err) {
      setError(
        isSi
          ? 'දත්ත ලබාගැනීමට නොහැකි විය. නැවත උත්සාහ කරන්න.'
          : isTa
            ? 'தரவைப் பெற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.'
            : 'Could not load NASA data. Please try again.'
      );
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [locationKey, metric]);

  const latest = data.length ? data[data.length - 1] : null;
  const previousYear = data.length >= 13
    ? data[data.length - 13]
    : null;

  const change = latest && previousYear
    ? Number((latest.value - previousYear.value).toFixed(2))
    : null;

  const unit = metric === 'T2M' ? '°C' : 'mm/day';

  return (
    <section className="space-y-6 text-slate-100">
      <header className="rounded-2xl border border-emerald-500/30
        bg-gradient-to-br from-emerald-950/60 via-slate-950 to-cyan-950/40
        p-5 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-emerald-400/30
            bg-emerald-400/10 p-3">
            <Leaf className="h-7 w-7 text-emerald-300" />
          </div>

          <div>
            <h2 className="text-xl font-bold sm:text-3xl">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              NASA POWER environmental data explorer
            </p>
          </div>
        </div>

        <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300">
          {isSi
            ? 'ස්ථානයක් සහ දත්ත වර්ගයක් තෝරා පාරිසරික දත්ත කාලයත් සමඟ වෙනස් වන ආකාරය අධ්‍යයනය කරන්න.'
            : isTa
              ? 'இடத்தையும் தரவு வகையையும் தேர்ந்தெடுத்து சுற்றுச்சூழல் தரவின் மாற்றங்களை ஆராயுங்கள்.'
              : 'Explore historical environmental observations and investigate how conditions change over time.'}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="rounded-xl border border-slate-800
          bg-slate-950/80 p-4">
          <span className="mb-2 flex items-center gap-2 text-sm text-slate-300">
            <MapPin className="h-4 w-4 text-cyan-400" />
            Location
          </span>

          <select
            value={locationKey}
            onChange={e => setLocationKey(e.target.value)}
            className="w-full rounded-lg border border-slate-700
              bg-slate-900 p-3 text-sm text-white"
          >
            <option value="sriLanka">Sri Lanka</option>
            <option value="london">London</option>
            <option value="newYork">New York</option>
          </select>
        </label>

        <label className="rounded-xl border border-slate-800
          bg-slate-950/80 p-4">
          <span className="mb-2 flex items-center gap-2 text-sm text-slate-300">
            <Activity className="h-4 w-4 text-emerald-400" />
            Environmental indicator
          </span>

          <select
            value={metric}
            onChange={e => setMetric(e.target.value)}
            className="w-full rounded-lg border border-slate-700
              bg-slate-900 p-3 text-sm text-white"
          >
            <option value="T2M">Air temperature (°C)</option>
            <option value="PRECTOTCORR">Precipitation (mm/day)</option>
          </select>
        </label>
      </div>

      {latest && !loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-cyan-500/20
            bg-slate-950/80 p-5">
            <p className="text-sm text-slate-400">Latest available value</p>
            <p className="mt-2 text-3xl font-bold text-cyan-300">
              {latest.value} {unit}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {latest.date} · {LOCATIONS[locationKey].name}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-500/20
            bg-slate-950/80 p-5">
            <p className="text-sm text-slate-400">
              Change vs. previous 12 months
            </p>
            <p className="mt-2 text-3xl font-bold text-emerald-300">
              {change === null
                ? '—'
                : `${change > 0 ? '+' : ''}${change} ${unit}`}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Difference between two monthly observations 12 months apart
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800
        bg-slate-950/80 p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-white">
            Historical observations
          </h3>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border
              border-cyan-500/30 px-3 py-2 text-sm text-cyan-300
              hover:bg-cyan-950/50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="py-12 text-center text-slate-400">
            Loading NASA data...
          </p>
        ) : error ? (
          <p role="alert" className="py-12 text-center text-amber-300">
            {error}
          </p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  tick={{ fontSize: 10 }}
                  interval={11}
                />
                <YAxis
                  stroke="#94a3b8"
                  tick={{ fontSize: 11 }}
                  width={55}
                />
                <Tooltip
                  contentStyle={{
                    background: '#020817',
                    border: '1px solid #334155',
                    borderRadius: 12
                  }}
                  labelStyle={{ color: '#67e8f9' }}
                  formatter={value => [`${value} ${unit}`, 'Value']}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="mt-4 text-xs leading-5 text-slate-500">
          Source: NASA POWER. These are gridded environmental estimates,
          not direct measurements from a weather station. Differences
          alone do not establish the cause of a climate trend.
        </p>
      </div>
    </section>
  );
}
