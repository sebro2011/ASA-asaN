# NOVA Hypothesis Forge — Security and Privacy

## 1. Threat model

| Asset | Threat | Mitigation |
|---|---|---|
| NASA API key | Leakage to the browser, logs, provenance or passport | Key read only from `process.env` on the server; appended to upstream URLs; stripped by `sanitiseUrl` before any URL leaves the connector; never included in a response body. |
| Upstream budget | Abuse of a shared key | Per-router rate limit, TTL cache, per-request timeout, dataset plan limited to compatible sources. |
| Server memory | Unbounded cache growth | Per-instance `Map` cache with TTL eviction; request body limit 256 kB. |
| User input | Injection, prototype pollution, oversized payloads | Type checks, 8–1200 character bound, `sanitiseContext` allow-list with `__proto__` rejection, numeric/string coercion only. |
| Client storage | Sensitive or unbounded history | Device-local only, versioned schema, 12-investigation cap, quota fallback to four, no upload. |
| Scientific integrity | Model-generated claims or numbers | No LLM in the investigation path; statistics are pure functions; conclusions are enumerated rules. |
| Prompt injection | A question trying to force a `proven` verdict or reuse injected text as evidence | The verdict set is a TypeScript union; evidence rule text is generated from thresholds, not from the question; the API test asserts an injection attempt cannot produce `proven` or echo the injected phrase into evidence. |

## 2. Input validation

`validateQuestion`:

- rejects non-strings, strings shorter than 8 characters (after trim) and longer than 1200;
- returns `INVALID_REQUEST` with a stable code, never a stack trace.

`language` is coerced to `en | si | ta`, defaulting to the detected language. `hypothesisId` is
accepted only when it exists in the generated set.

`context` (follow-up) is rebuilt with an explicit allow-list of request fields; unknown dataset
ids and method ids are dropped; `__proto__`, `constructor` and `prototype` are rejected; nested
objects are copied field by field.

## 3. URL and credential handling

```ts
sanitiseUrl(url) // removes api_key, key; returns an official URL safe to display
```

- Applied to provenance `sourceUrl`, evidence `sourceUrl` and the passport.
- The API test seeds the server with `SUPER_SECRET_NASA_KEY_42`, runs an investigation, and
  asserts the secret appears nowhere in the catalogue, interpretation, investigation or
  passport JSON, while the upstream fetch calls did carry `api_key=…`.
- The catalogue exposes only `documentationUrl` (official HTTPS pages), never the connector
  endpoint with parameters.

## 4. Rate limiting and abuse resistance

- `createForgeRouter` constructs its own bucket map, so two routers (for example an app and a
  test) never share a budget.
- Exceeding the budget returns `429` with `code: "RATE_LIMITED"` and `Retry-After`.
- The client surfaces the error and does not retry automatically.
- Investigation requests are bounded by the plan: only compatible datasets with adequate
  coverage are called, and out-of-coverage sources are skipped entirely (asserted: the Kp
  endpoint is never called for a 1989 window).

## 5. Transport and response hygiene

- JSON-only responses with an explicit `ok` discriminator.
- Errors carry `{ ok: false, code, error }` and no internal paths.
- Source failures are represented as data (`unavailable`, `partial`, `out-of-coverage`), not as
  thrown exceptions that could leak stack traces.
- The client uses `AbortController` with a 45 s budget; after abort it reports `TIMEOUT` rather
  than showing a partial object as complete.

## 6. Privacy

- The investigation request contains the question, language, optional allow-listed context and
  an optional hypothesis id. Nothing else.
- No account is required; no investigation is written to Supabase or any server store.
- Research history lives in the browser (`nova_forge_memory_v1`). Clearing it is a local
  `removeItem`.
- Export produces a local file download; the app does not upload it.
- The passport contains the question and derived science, so exporting it is an explicit user
  action with a visible button.

## 7. Integrity as a security property

The most damaging failure mode for a scientific feature is not an exploit but a confident false
claim. The following are enforced in code and tests:

- `verdict` cannot be `proven`;
- every evidence item tied to a hypothesis has a non-empty `rule`;
- classifications require sample-size thresholds;
- a lead-lag result with the response leading the driver is reclassified as contradicting;
- a missing source yields `insufficient`, never `neutral`;
- the passport repeats the disclaimer and the causal caveat;
- interface copy is scanned for "proven", "guaranteed", "world's first", "peer-reviewed" and
  precedence claims.

## 8. Residual risks

- A server operator could log request bodies or upstream URLs; deployment guidance must keep
  `api_key` out of access logs.
- Rate limiting is in-memory, so a horizontally scaled deployment would need a shared store.
- Device-local history can be read by anyone with access to the browser profile; it contains no
  credentials.
- The engine trusts the upstream source's own values and metadata; it does not detect a
  compromised upstream beyond schema and range checks.
