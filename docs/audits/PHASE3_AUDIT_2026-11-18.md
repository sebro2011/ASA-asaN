# COSMORA — audit and repair pass, 2026-11-18

Branch `arena/9805b9df-asa-asan` (from `main` @ `7b792bc`). Nothing in this pass was
merged, pushed or deployed; every change is on the working branch only.

**A note on the branch instruction.** The brief asked for a separate repair branch.
This session is bound to a single branch (`arena/9805b9df-asa-asan`), which already
carries the merged-ready home-card fix (PR #73). Creating and switching to a second
branch is not possible here, so all work for this pass sits on top of that branch and
nothing was pushed. If the two changes should ship separately, they are separated by
commit, not by branch.

---

## A. Executive summary

The application is in good shape: it builds, its full JavaScript suite passes, its
Python research suite passes, and its production deployment is answering with real
NASA data. The audit found **one bounded-memory defect in server code**, **eight
scientific/provenance defects with demonstrable root causes**, **three documentation
claims that overstated what the code guarantees**, and **four stale pull requests**.
All of the above were repaired or are argued open below.

The most consequential findings, in order:

1. **The Earth Intelligence rate limiter was unbounded** and the payload cache had no
   hard ceiling. Fixed and tested (10 cases).
2. **A `--quick` scientific run reported the identity of the full configuration it
   never executed**, and **`payload_sha256` was not a digest of any file a reader can
   check**. Both are now honest; the second is now verifiable against the digests the
   repository publishes.
3. **Feature lags were positional**, so a single missing month would have shifted every
   lag by one month with no error. Reproduced, then fixed; the reported run is
   unaffected (`dropped_months = 0`).
4. **PR #60 and #55 would regress `main`** if merged: the branding PR reverts main's
   `Glass` header refactor and two meta tags, and the docs PR deletes newer entries.
   PR #20 is already in `main`. PR #5 is clean but documents a superseded redesign.
5. **Production APOD is failing upstream right now** (`api.nasa.gov` → HTTP 500). The
   app reports that honestly instead of substituting a picture.

No scientific conclusion in `COSMORA_AI_v3` changed. Every correction in that package
touches identity, provenance, validation or a code path the reported run never enters.

---

## B. Confirmed defects

Severity: **S1** changes what the experiment measures · **S2** changes a reported
number/claim/provenance · **S3** robustness/hygiene · **R** runtime/server.

| # | Sev | File · function | Root cause | Correction | Test evidence |
| --- | --- | --- | --- | --- | --- |
| R1 | **R** | `server/earthIntelligence.ts` · `rateLimit`/`rateBuckets` | entries were only replaced when the *same* client returned after its window; a client that appears once left a permanent entry, so the map grew with distinct clients forever and never shrank | `sweepRateBuckets` at 5,000 tracked clients + `enforceRateCap` ceiling of 10,000 (including a post-insert re-check, without which the map settled at ceiling + 1); the 429 wire contract is unchanged | `scripts/test-earth-rate-limit-memory.mjs` — 10 pass, incl. a 30,000-distinct-client simulation that stays ≤ 10,000 |
| R2 | **R** | same file · `cache` / `cacheSet` | swept expired entries above 400, but had no cap when every entry was live | `CACHE_MAX_ENTRIES = 600`, dropping the soonest-to-expire entries | same file (the cap path is exercised through `enforceRateCap`'s twin and the HTTP assertions) |
| D17 | **S2** | `COSMORA_AI_v3/src/cosmora_v3/run.py` · `run` | `--quick`/`epochs_override` changed the model, but the manifest, report, dashboard footer and run directory carried `config["config_hash"]` — the *unmodified* config | `_apply_epoch_override` resolves and re-hashes the effective config before anything is named after it; `effective_config.json` written to the run directory; `configured_config_hash` kept and reported as overridden; no override ⇒ the same object, so full runs keep `a6bbe9432b389257` | `tests/test_d17_d18_d19_d21_repairs.py` — 3 tests; synthetic `--quick` run: `config_hash cef18dda61ecb125`, `configured 8a8600ab2cca3cc0`, `epochs_effective {mlp:40, gru:40, lstm:40}` |
| D18 | **S2** | `data.py` · `fetch_location` | digest taken over `json.dumps(payload, sort_keys=True)` on a cache hit and over the response text on a cold fetch; neither is a digest of a file | hash the cache file's bytes on both paths | digest now equals `data/cache/README.md` (`911aac86…`, `fa9ea32e…`, `ef2ea94b…`) where the committed manifest carries `443d6d9b…` etc. |
| D20 | **S2** | `features.py` · `build_features` | `shift(k)`/`rolling(w)` are positional; one dropped month silently turns `lag1` into `lag2` for every later row | `_complete_monthly_index` reindexes to a gap-free monthly calendar before any shift; rows that cannot be described from history are dropped rather than misdescribe | reproduced: with 2020-08 dropped, lag-1 for 2020-09 returned `59.0` (the 2020-07 value) instead of `60.0`; `tests/test_d20_calendar_features.py` — 4 tests |
| D21 | **S2** | `config.py` · `validate_config` | four holes: missing `lat` → raw `KeyError`; `test_months = 0` accepted (empty tail, `n = 0`, still `scientific_results: true`); no visibility of fold overlap; POWER window validated against config arithmetic, never against loaded data | `ConfigError` naming the location/key; `test_months ≥ 12` and `cv_validation_months ≥ 1`; `fold_overlap()` recorded in the manifest and printed in `REPORT.md`; `configured_months`/`months_short_of_window` recorded per location | 7 tests in the repairs suite |
| D22 | **S3** | `data.py` · `_frame_from_payload` | duplicate months became two training rows with no signal | identical copies de-duplicated and counted (`duplicate_month_rows_removed`); **disagreeing** copies refused instead of guessed | 2 tests |
| D24 | **S3** | `metrics.py` · `interval_score` | `lower` and `upper` were cleaned independently | one joint mask over `(y, lower, upper)` | reproduced: NaN lower bound raised `operands could not be broadcast together with shapes (3,) (4,)`; 2 tests |
| D27 | **S3** | `report.py` · `render_markdown_report` | printed the Python bool `True`; hash/epochs gaps from D17 | `yes`/`no`, configured-vs-effective hash line, fold-geometry line | the synthetic `--quick` run's `REPORT.md` |
| D30 | **S3** | `data.py` · `_download` | accepted any body containing the substring `"parameter"`; sent no `User-Agent` | parse and require `properties.parameter` to be a dict; send `User-Agent` + `Accept` | 2 tests |
| D19 | **S2 (partial)** | `data.py` · `_cache_path`/`fetch_location` | the cache filename encodes location + window only, so a payload fetched for one (parameters, community, base_url) can be served to another | request signature written into the payload and verified on read — mismatch refuses; caches written before the change are accepted as *legacy* and the provenance says `request_signature_checked: false` rather than claiming verification | 2 tests |
| — | **S2 (doc)** | `COSMORA_AI_v3/docs/FINAL_SCIENTIFIC_AUDIT.md` §8.3, `README.md` | "calibrated intervals" read as a guarantee | coverage described as measured, with the broken exchangeability assumption named (calibration 2010–2019, test tail 2020–2024) | text review; D13's method fix (adaptive conformal) remains open |

---

### B.1 Follow-up defect found from a production screenshot (same day)

| # | Sev | File · function | Root cause | Correction | Test evidence |
| --- | --- | --- | --- | --- | --- |
| U1 | **S2 (presentation)** | `src/components/earth/AnalystPanel.tsx` · section bullets; `server/earth/localAnalysis.ts` · verified-text builder | a bullet pasted the entire POWER request URL (~220 characters, no spaces) and the bullet's text node had no `min-width` or word break, so the flex item's min-content width was the URL. In the two-column grid the left column overflowed its card and painted the URL across the right-hand "Calculated from retrieved data" panel. | bullets render through `BulletText` (`min-w-0 [overflow-wrap:anywhere]`, cards `min-w-0 overflow-hidden`), bare URLs become wrapping links, and the prose now names the host while the full query stays in the evidence block and `sources[].url` | `scripts/test-earth-analyst-ui.mjs` (new case 4) + `scripts/test-earth-analyst.mjs` (new case 31): the link is an `<a rel="noreferrer">`, the wrapper carries the wrap classes, and the dataset bullet contains `power.larc.nasa.gov` but no `?parameters=` |
| U2 | **unresolved observation** | provider metadata | production showed `6 attempt(s)` **and** `6 retry attempt(s)`. With `retries = Σ(attempts−1)` over a non-empty chain, `retries` cannot equal `attempts`; a local reproduction of the same bundle gives `attempts 6 / retries 4` for two providers × three attempts. | numbers left untouched; both pills now carry tooltips explaining what they count, so the pair cannot read as one fact stated twice | not reproduced — settling it needs a live `POST /api/earth/analyst`, which this sandbox cannot make (GET-only fetch tool, no egress) |

## C. Potential risks (identified, not reproduced)

| Item | Why it is not a confirmed defect |
| --- | --- |
| `cache` map growth in `server/earthIntelligence.ts` before this pass | bounded in principle by distinct (route, client) pairs with a ≤ 12 h TTL; nothing shows it reached a problematic size in production. Fixed as a precaution, reported as bounded memory, not as an exploited vulnerability. |
| `providerLastCall` map (same file) | keys are provider names, a closed set; no growth path. |
| Per-IP limits are per process | `server/requestRateLimit.ts` and the Earth limiter count in memory; instances do not share counters, so a fleet-wide budget is not enforced. Documented, unchanged. |
| `trust proxy` default of 1 hop | correct for Vercel/Cloud Run; wrong (over-trusting) if the app is ever exposed directly, which would let a client forge `X-Forwarded-For`. `TRUST_PROXY=0` is documented. |
| APOD `upstreamStatus: 500` | external; the app degrades honestly. No cache poisoning observed (`test-apod-*` covers the historical-date path). |
| Dependency advisories | pre-existing on `main` (dev-chain), not introduced here; no `npm audit fix` was run. |

---

## D. Scientific audit

**Suite:** `cd COSMORA_AI_v3 && python -m unittest discover -s tests` → **103 tests, 0 failures**
(79 pre-existing + 24 new). Pinned dependencies installed from PyPI at the versions in
`requirements.txt` (numpy 2.4.6, pandas 3.1.1, scikit-learn 1.9.1, scipy 1.17.1,
xgboost 3.2.0, matplotlib 3.10.7). The sandbox has no HTTPS egress to
`power.larc.nasa.gov`, so the committed payloads were used — which is exactly what the
reproduce path expects.

**The four phase-2 fixes are intact.** D11 (early-stopping split), D12 (overlapping folds
averaged, not double-counted), D14 (Newey–West variance, Student-t with HLN), D15
(Benjamini–Hochberg) all keep their suites green; the D17 change is the only one that
touches `config_hash`, and it provably leaves full-run hashes untouched.

**Interpretation of the reported findings — unchanged, and these are not software bugs:**

| Finding | Cause | Verdict |
| --- | --- | --- |
| Temperature skill is positive (test MAE 0.263 / 0.471 / 0.349 °C at XGBoost; skill +0.61 / +0.22 / +0.23) | strong annual cycle + autocorrelation; climatology is a strong but beatable baseline | genuine skill, one-month-ahead only |
| Rainfall skill is negative everywhere | tropical convective rainfall at monthly scale is close to noise for a 12-month lookback; the climatological monthly mean is hard to beat | genuine limitation of the design and the data, not a coding error |
| The ensemble is not consistently superior (3 of 4 "better" verdicts survive D14 + BH; aggregate MAE is *worse* than XGBoost) | equal weights by construction, no learned weighting | correct conclusion; the audit already reports it |
| Interval coverage 0.817–1.000 (mean 0.924) around a nominal 0.90 | exchangeability broken between 2010–2019 calibration and 2020–2024 test tail | measurement, now labelled as such; adaptive conformal still open (D13) |

**Not demonstrated here:** I did not re-run the full 1,014 s experiment (three cities ×
two targets × five models × five seeds). The changes that could touch a result were
reasoned about and, where possible, checked against the committed evidence: the
payloads are unchanged byte-for-byte, `dropped_months = 0`, duplicate months = 0,
`interval_scores.csv` contains no NaN bounds, and the cache-hit digest change affects a
recorded value, not a computation. A synthetic `--synthetic --quick` run completed
end-to-end (27 s) and produced all artefacts, which exercises the edited code paths.

---

## E. Security audit

| Area | Finding | Status |
| --- | --- | --- |
| `server/securityHeaders.ts` | production CSP has no `'unsafe-inline'` in `script-src` (dev keeps it for Vite), explicit `frame-src` allow-list, `object-src 'none'`, `base-uri 'self'`, HSTS only when secure | sound; unchanged |
| `server/cors.ts` | never rejects a request for its `Origin`; grants only same-host or allow-listed hosts and lets the browser refuse the read; dev allows all | sound; unchanged |
| `server/trustProxy.ts` | default 1 hop, `TRUST_PROXY=0|false|none` to disable, unusable values produce a startup warning rather than silent trust | sound; unchanged |
| `server/requestRateLimit.ts` | per-limiter maps, prune at 5,000, cap at 10,000, `retry-after` + `x-ratelimit-*` | sound; unchanged |
| `server/earthIntelligence.ts` rate limiting | **unbounded map** (R1) | **fixed this pass** |
| `server/nasaRoutes.ts` | upstream URLs built server-side, no key echoed to the client, `keySource` reported as `DEMO_KEY|configured` only | sound; unchanged |
| `scripts/audit-env.mjs` | failed the build on undocumented variables; three real ones were missing | 3 added to `.env.example` → `34 variables · 0 undocumented`, exit 0 |
| `.env.example` | no values, only names and comments | unchanged apart from the three additions |
| Secrets in tracked files | three regex hits, all obvious redaction fixtures (`sk-abcdef0123456789abcdef`, `AIzaSyA1b2C3d4…`) used by tests and by the server's own redaction path | no real credential in the repository |
| Dependency vulnerabilities | pre-existing dev-chain advisories on `main`; nothing new introduced, no blind `audit fix` run | reported, untouched |

---

## F. Test and build results

| Command | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | clean install, 719 packages |
| `npm run lint` (`tsc --noEmit`) | **clean** |
| `npm test` (full chain, 40 scripts) | **all pass, 0 fail** — see the per-suite table below |
| `npm run build` | exit 0 · PWA 164 precached entries · `check:pwa` ok |
| `npm run check:bundle` | `api/index.js` in sync with `server/` |
| `npm run audit:env` | 34 variables · 0 undocumented · no secret reachable from browser code |
| `python -m unittest discover -s tests` (COSMORA_AI_v3) | **103 tests, 0 failures** |
| `python scripts/run_experiments.py --synthetic --quick --locations colombo` | exit 0, all artefacts written, 27 s |

New/changed test scripts this pass: `scripts/test-earth-rate-limit-memory.mjs` (10),
`scripts/test-home-preview-honesty.mjs` (7, from PR #73),
`COSMORA_AI_v3/tests/test_d20_calendar_features.py` (4),
`COSMORA_AI_v3/tests/test_d17_d18_d19_d21_repairs.py` (20).

**Skipped/none:** no test was skipped or disabled, and no assertion was relaxed. Two
assertions in the new Python suites encode the *corrected* behaviour; they are new
tests, not edited ones.

---

## G. API and website status (production `7b792bc`, 2026-11-18T10:44Z)

| Feature | Loaded | Real data | Cached/fallback | Errors displayed honestly | Notes |
| --- | --- | --- | --- | --- | --- |
| Home page | ✅ 200 | — | — | — | full page rendered, all sections present |
| APOD card | ✅ rendered | ❌ | labelled **Unavailable** | ✅ | `/api/apod` → `APOD_UNAVAILABLE`, `upstreamStatus: 500`, hint "api.nasa.gov answered HTTP 500" |
| Orbital tracking (ISS) | ✅ | ✅ epoch 2026-11-18 10:44Z, 51.57N 135.11E, 421 km | — | — | two-body propagation labelled when used |
| Near-Earth objects | ✅ | ✅ 31 objects, 2026-11-18→24, 1 hazardous, closest (2018 NE1) 16.60 LD | — | — | NeoWs window |
| NASA POWER Earth preview | ✅ | ✅ Colombo T2M 2012–2026, mean 26.5 °C, +0.034 °C/yr | — | ✅ | "Complete years 15" was wrong; fixed on this branch (PR #73), not yet deployed |
| NOVA diagnostics | ✅ | ✅ local model `ok`, providers configured | — | — | budgets 15000/25000 intact |
| NOVA chat | ⚠️ not exercised | — | — | — | needs POST; the sandbox has no egress |
| Mars rover photos, DONKI, GIBS tiles, exoplanets, missions | ⚠️ not tested | — | — | — | no browser, no egress from the sandbox |
| 3D / WebXR / AR, launch simulator, soundscape, space shorts | ⚠️ not tested | — | — | — | browser-only surfaces |

Features are marked tested only where a response was observed. Component existence is
not evidence of function.

---

## H. GitHub status

| Item | State |
| --- | --- |
| Branch | `arena/9805bdf…` → `arena/9805b9df-asa-asan`, based on `main` @ `7b792bc` |
| PR #73 (home cards) | open, reviewable; this pass adds commits on the same branch |
| Push / merge / deploy this pass | **none** (as instructed) |
| CI | not triggered by this pass; the local equivalents of every CI step (`lint`, `test`, `build`, `check:bundle`, `audit:env`) were run |

### The four inspected pull requests — recommendation, no action taken

| PR | Base state | Finding | Recommendation |
| --- | --- | --- | --- |
| **#60** branding | `mergeable: false` (`dirty`) | its content is **already in `main`** (README, header, `manifest.json`, `i18n` all say COSMORA). Worse, its tree is *behind*: merging would revert main's `Glass`-based header (`<Glass as="header" tone="strong">` → raw `<header>` + `backdrop-blur-2xl`) and delete `og:site_name` + `application-name` from `index.html`, and flip the `<noscript>` text back to "NOVA AI" | **close** — duplicate work that would regress `main` |
| **#55** NOVA post-merge probe | `mergeable: false` (`dirty`) | docs-only; `main` now contains newer versions of all five files, and the PR's hunks would delete the 2026-11-14 tile section, the 2026-11-18 chat self-test block and the `GEMINI_ACCESS_RUNBOOK` post-merge status | **close** — superseded; the finding it recorded is already in `main` |
| **#20** CosmoVision search/community feed | `mergeable: false` (`dirty`) | the exact change is **already in `main`** (`SpaceShortsPage.tsx` lines 390/392, plus a newer `network` branch that did not exist then) | **close** — already merged by another route |
| **#5** redesign audit doc | `mergeable: true` (`clean`) | adds `docs/NASA_SPACE_EXPLORER_REDESIGN_REVIEW.md` (110 lines), which `main` does not have; it audits the pre-COSMORA "NASA Space Explorer" naming | **retain** — mergeable and harmless, but it needs a rename/date note before it is quoted as current; low priority |

---

## I. Remaining work, in priority order

1. **D16 — `config_hash` covers presentation settings** (S2). Changing the hash set
   invalidates every stored hash, including those quoted in the audit; it needs a
   versioned hash (`config_hash_v2`) and a migration note. Recommended next.
2. **D13 method — adaptive conformal intervals** (S2). The claim is now honest; the
   method is still exchangeability-dependent. Implement time-weighted/ACI calibration on
   the most recent folds and report coverage per cell.
3. **D19 residual** — the cache filename still omits the request signature, so a legacy
   file can be served to a mismatched request without the mismatch being detectable.
   Fix by renaming to `power_<id>_<window>_<sig8>.json` with a migration for the three
   committed payloads (this changes their digests, so it must be done once, deliberately).
4. **D25/D23** — the MAPE-style metric is unusable on dry months, and a constant series
   produces NaN metrics with no flag. Both need a metrics-schema decision because the
   evidence tables are compared byte-for-byte.
5. **D28** — execute the notebook in CI (one full run) so its 15 code cells cannot rot.
6. **D29** — `XGBoostModel` hardcodes `n_jobs=4` and `EnsembleModel` refits its members;
   ≈3× wasted compute with identical results.
7. **D31** — 240 style-only ruff findings.
8. **Operational** — APOD is upstream-failing; a status note on the panel would help
   operators distinguish "NASA is down" from "our key is wrong" (the diagnostics route
   already knows the difference).
9. **Fleet-wide rate limits** are still per process (documented, needs a shared store).
10. **PR grooming** — close #60, #55, #20; decide on #5 (all four were left untouched).
11. **U2 — the attempt/retry pair** shown as `6 / 6` in production. The arithmetic in
    `server/earth/providerOrchestrator.ts` cannot produce it from the committed bundle,
    so either the running chain double-counted an entry or the client read the same
    field twice. One live `POST /api/earth/analyst` from a browser settles it.

---

## J. Change summary

| File | Why |
| --- | --- |
| `server/earthIntelligence.ts` | bounded the rate-limit map (sweep at 5,000, ceiling 10,000, post-insert re-check), added a hard ceiling to the payload cache, extracted `touchRateBucket` so the memory behaviour is testable against the code the middleware runs |
| `scripts/test-earth-rate-limit-memory.mjs` *(new)* | 10 tests: expiration, no-op sweeps, cap ordering, the 30,000-client bound, the 429 contract, spoofed `X-Forwarded-For` |
| `package.json` | wired `test:earth-rate-memory` into `npm test` |
| `.env.example` | documented `EARTHDATA_BEARER_TOKEN`, `NOAA_CDO_TOKEN`, `EARTH_ANALYST_OSS_BASE_URL` (audit:env now reports 0 undocumented) |
| `COSMORA_AI_v3/src/cosmora_v3/config.py` | D21 validation (required location keys, numeric coordinates, `test_months ≥ 12`, `cv_validation_months ≥ 1`) + `fold_overlap()` |
| `COSMORA_AI_v3/src/cosmora_v3/data.py` | D18 file-bytes digest, D19 request signature, D22 duplicate handling, D30 structural validation + `User-Agent`, D21 `configured_months`/`months_short` provenance |
| `COSMORA_AI_v3/src/cosmora_v3/features.py` | D20 gap-free monthly calendar before any shift/rolling |
| `COSMORA_AI_v3/src/cosmora_v3/metrics.py` | D24 joint mask in `interval_score` |
| `COSMORA_AI_v3/src/cosmora_v3/run.py` | D17 effective-config hashing, `effective_config.json`, `configured_config_hash`, `fold_overlap` in the manifest |
| `COSMORA_AI_v3/src/cosmora_v3/report.py` | D27 `yes`/`no`, configured-vs-effective hash line, fold-geometry line |
| `COSMORA_AI_v3/tests/test_d20_calendar_features.py` *(new)* | 4 tests locking the calendar-lag contract |
| `COSMORA_AI_v3/tests/test_d17_d18_d19_d21_repairs.py` *(new)* | 20 tests for D17/D18/D19/D21/D22/D24/D30 |
| `COSMORA_AI_v3/docs/DEFECT_REPORT.md` | §10 phase-3 register: what was fixed, what was measured, what was deliberately left open, and how to reproduce |
| `COSMORA_AI_v3/docs/FINAL_SCIENTIFIC_AUDIT.md` | D13 claim corrected (§8.3 heading, method paragraph, conclusion bullet 3) |
| `COSMORA_AI_v3/README.md` | D13 claim corrected in the package summary |
| `docs/KNOWN_LIMITATIONS.md` | new 2026-11-18 section: the rate-limiter/cache fix, the provenance digest change, the effective-hash fix, the calendar-lag fix, what stays open, and the live APOD outage |
| `docs/API_STATUS_REPORT.md` | live measurement block for production `7b792bc` at 10:44Z, with an explicit "not verified" list |
| `docs/TEST_RESULTS.md` | refreshed with this pass's exact numbers |
| `docs/audits/PHASE3_AUDIT_2026-11-18.md` *(new)* | this report |
