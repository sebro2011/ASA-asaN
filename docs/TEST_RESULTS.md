# Test results

Latest full run: **2026-11-12**, branch `arena/ad469a17-asa-asan`.

| Command | Result |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | clean |
| `npm run build` | exit 0 · 158 precache entries · entry chunk 888 KB |
| `npm test` | **704 pass / 0 fail** |
| `npm run test:forge` | 224 pass / 0 fail |
| `npm run test:nasa` | 22 pass / 0 fail |

`npm test` runs 44 suites: `lint`, `test:api-routes`, `test:apod`, `test:earth`,
`test:nova-chat`, `test:nova-diagnostics`, `test:space-videos`, `test:space-news`,
`test:community`, `test:ai-viewer`, `test:welcome`, `test:earth-server`,
`test:earth-analyst`, `test:earth-analyst-ui`, `test:space-build-security`,
`test:security-performance`, `test:workspace` (17 sub-suites), `test:nasa`,
`test:forge` (11 sub-suites).

## Suites added on this branch

| Suite | Tests | What it pins |
| --- | --- | --- |
| `scripts/test-solar-weather.mjs` | 5 | Kp/plasma parsing, NOAA G-scale, outage → 503, last-measured sample marked stale |
| `scripts/test-solar-weather-dom.mjs` | 3 | panel states `live`/`stale`/`sample` and their labels, "not reported" solar wind |
| `scripts/test-nasa-archive.mjs` | 10 | normalisation from real fields only, dropped malformed rows, allowlist, TTL cache, typed failures, route contract |
| `scripts/test-nasa-archive-client.mjs` | 4 | failure is not an empty success, retry not cached, no fabricated ids in the module |

## What these tests do not cover, and cannot here

- **No live network.** Outbound access from this environment reaches the package
  registries and GitHub only. NOAA SWPC, `images-api.nasa.gov` and `api.nasa.gov`
  are exercised through injected `fetch` implementations, not real endpoints.
  Live behaviour is **unverified** and stated as such in the reports.
- **No browser.** No Playwright/Chromium is available, so there are no screenshot
  or pixel assertions. UI tests run in jsdom and assert DOM contracts and copy.
- **No provider keys.** Gemini/OpenRouter/Arena are tested through injected
  adapters. The production diagnostics output is recorded in
  `docs/API_STATUS_REPORT.md`; it is evidence about the deployment, not a test.
