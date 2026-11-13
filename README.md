# NASA Space Explorer

A trilingual (English · සිංහල · தமிழ்) space-exploration workspace built on real
NASA data: APOD, Earth intelligence from NASA POWER and GIBS, missions, asteroids,
space weather, a 3D celestial lab, and **NOVA** — an AI assistant that runs on a
bundled local science engine and, when configured, on OpenRouter, Gemini or Arena.

Everything scientific is sourced; where a source cannot be reached the interface
says so instead of inventing a number.

- **Frontend:** React 19, Vite 8, TypeScript, Tailwind 4, three.js, i18next
- **Server:** Express 4 on Node 22, TS via `tsx`; the same app is exported for
  Vercel (`api/index.js`, built by esbuild from `server/vercelEntry.ts`)
- **Storage:** Supabase (optional) — workspace sync, community, Guardian fleet state

---

## Quick start

```bash
npm install
cp .env.example .env      # every variable is documented there; all are optional
npm run dev               # http://localhost:3000 (Vite middleware + API)
```

Production-style run and checks:

```bash
npm run build             # bundles server/vercelEntry.ts → api/index.js, then Vite
npm start                 # tsx server.ts (serves dist/ if it exists)
npm run lint              # tsc --noEmit — must stay clean
npm test                  # 67 suites, 819 tests
```

Requires Node 22+. `npm start` uses `tsx` because Node's type stripping cannot
transform TypeScript parameter properties.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Express + Vite dev middleware on `PORT` (default 3000) |
| `npm start` | Production mode: static `dist/` + API |
| `npm run build` | Server bundle + client build |
| `npm run lint` | `tsc --noEmit` |
| `npm test` | lint + every suite (API, APOD, Earth, NOVA, videos, news, community, workspace, NASA, Guardian, Forge, rate limiting) |
| `npm run test:guardian` | Fleet diagnostics suite only (56 tests) |
| `npm run check:apis` · `verify:earth` · `verify:explore` | Optional live probes (need outbound network) |

## How the API is organised

| Prefix | Purpose |
| --- | --- |
| `/api/nova/*` | Chat, config, diagnostics, L.I.F.E. local engine |
| `/api/earth/*` | POWER proxy, GIBS tiles/domains, grounded analyst |
| `/api/news`, `/api/space-videos`, `/api/community` | Spaceflight news, papers, CosmoVision |
| `/api/mars`, `/api/apod`, `/api/neows`, `/api/epic`, `/api/solar-weather` | NASA data proxies with caching |
| `/api/forge/*` | NOVA Hypothesis Forge (statistics, connectors, research) |
| `/api/guardian/*` | Dependency diagnostics — see [`docs/audits/COSMORA_GUARDIAN.md`](docs/audits/COSMORA_GUARDIAN.md) |

Every AI key is read server-side only. No key is ever sent to the browser, put in a
URL, or written to a log; upstream bodies are scrubbed before they leave the server.

## Verification status — read this before trusting a feature

| Claim | Status |
| --- | --- |
| 67 suites / 819 tests, `tsc` clean, build reproducible | verified in this environment on 2026-11-13 |
| Bilingual parity — 1,732 keys in en/si/ta, 0 missing | verified by script |
| Guardian fleet behaviour (breakers, budgets, lease, recovery) | verified with two coordinators over one store — not multi-region |
| Live NASA / Gemini / OpenRouter / Supabase reachability | **not verified here** (egress restricted); see `docs/API_STATUS_REPORT.md` |
| Supabase migration for the Guardian | written, **not applied** (needs approval) |
| Browser-level rendering | jsdom only; no visual claim made |

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/audits/MASTER_AUDIT_REPORT.md`](docs/audits/MASTER_AUDIT_REPORT.md) | Current audit: 2 critical + 8 major findings, what was fixed, what needs a decision |
| [`docs/TECHNICAL_ARCHITECTURE.md`](docs/TECHNICAL_ARCHITECTURE.md) | System architecture |
| [`docs/API_STATUS_REPORT.md`](docs/API_STATUS_REPORT.md) | Every route: source, cache, failure mode, live status |
| [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md) | What was run, and what it proves |
| [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) | Limits, stated plainly |
| [`docs/DEVELOPMENT_CHANGELOG.md`](docs/DEVELOPMENT_CHANGELOG.md) | Dated changes with their verification |
| [`docs/NOVA_NEXUS_ARCHITECTURE.md`](docs/NOVA_NEXUS_ARCHITECTURE.md) | NOVA engine and provider fabric |

## Deployment

Vercel builds with `npm run build` and serves `api/index.js` for `/api/*`; all other
paths fall through to the SPA (`vercel.json`). Set only the variables you need —
`.env.example` marks which are public, which are server-only, and which must be a
service-role key. Do not deploy the Guardian migration or cron entry without
reading its limitations first.
