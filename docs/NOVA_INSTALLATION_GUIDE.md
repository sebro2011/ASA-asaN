# NOVA installation guide

How to install NEXUS/N.O.V.A. and get a working local installation without
breaking the existing app. Written for the repository at
`sebro2011/ASA-asaN`.

---

## 1. Requirements

| Requirement | Version | Why |
| --- | --- | --- |
| Node.js | **22.5+** (22.22.3 used here) | `node:sqlite` (`DatabaseSync`) and `node:test` |
| npm | 10+ | scripts |
| Disk | ~300 MB with `node_modules`; the database starts empty | |
| Optional | Ollama ≥ 0.3, or llama.cpp / vLLM / LM Studio | actual local generation |
| Optional | Supabase project | only if you want the cloud mirror of the records |

`node:sqlite` prints an ExperimentalWarning on Node 22. It is expected and does
not affect behaviour.

## 2. Install and run

```bash
git clone https://github.com/sebro2011/ASA-asaN.git
cd ASA-asaN
git checkout <branch-with-nexus>
npm install
cp .env.example .env          # then edit
npm run dev                   # Vite + Express, default port 3000
```

Production build:

```bash
npm run build                 # esbuild api bundle + vite client build
npm start                     # node server.ts (tsx-free, Node strips types on 22)
```

The life router is part of the same Express app (`server.ts`) and of the Vercel
bundle (`api/index.ts` → `server/vercelEntry.ts`). There is no second entrypoint
to deploy.

## 3. Database

**Local (default).** Nothing to do: on first request the engine creates
`<cwd>/.nova-life/life.sqlite` and applies schema version 1 (tables, the FTS5 virtual
table and its triggers; benchmark cases are seeded on first use of the benchmark
service). Set `NOVA_LIFE_DB=/absolute/path.sqlite` to
put it elsewhere — keep it outside the web root and out of version control.

**Supabase (optional mirror).** Apply the migration in the Supabase SQL editor or
with the CLI:

```bash
supabase db push        # or paste supabase/migrations/20261108_nova_life.sql
```

It creates 13 `life_*` tables with RLS enabled and four policies each, scoped to
`auth.uid()`. The rollback is `supabase/migrations/20261108_nova_life_rollback.sql`
— it drops only `life_*` tables and leaves the workspace tables intact.

Check the migration without a database server:

```bash
npm run test:life-sql      # boots PGlite and applies both migrations
```

## 4. Environment

Start from `.env.example`. The values that matter for NEXUS:

```ini
NOVA_LIFE_DB=/absolute/path/life.sqlite
NOVA_LOCAL_ONLY=1
NOVA_LIFE_ALLOW_EXECUTE=0
NOVA_RESOURCE_PROFILE=balanced
OLLAMA_BASE_URL=http://127.0.0.1:11434
NOVA_LOCAL_MODEL=llama3.2:3b
```

Never put provider keys in client code; they are read server-side only. No key
value is returned by any endpoint.

## 5. First run checklist

```bash
npm run lint                    # tsc --noEmit
npm run test:life               # 48 engine tests
npm run test:workspace-intelligence   # 5 UI tests
npm test                        # 401 tests total
npm run build                   # bundle
```

Then open `/intelligence`:

1. Overview should show `LOCAL_ONLY`, the hardware profile, the storage engine and
   real counts (zeros on a fresh install).
2. Models & runtime → *Check providers* shows each provider with `ok` or the real
   connection error.
3. Memory → create a memory; it appears with version 1.
4. Security → the six baseline grants are on; `tools.execute`, `network.fetch`,
   `transmit.external`, `simulation.apply` are off.
5. Benchmarks → *Run benchmarks* returns 7/7 on the deterministic cases.

If any of those shows a fabricated number, that is a bug — every value on the
page comes from an endpoint.

## 6. Enabling execution (optional, deliberate)

```bash
NOVA_LIFE_ALLOW_EXECUTE=1
```

Then in Security Center grant `tools.execute` and record an approval. Only these
scripts can run: `test`, `test:workspace`, `test:workspace-modules`,
`test:workspace-astronomy`, `test:nova-chat`. Anything else is
`SCRIPT_NOT_ALLOWED`. Execution uses the privileges of the server process — do not
run the server as root.

## 7. Upgrading

- `schema.js` migrations are append-only with a version number. Never edit a
  shipped migration; add the next one and bump `LATEST_SCHEMA_VERSION`.
- Back up first: `POST /api/nova/life/backup` copies the SQLite file, or copy it
  while the server is stopped.
- The Supabase mirror needs the same migration applied; the rollback exists so a
  failed upgrade can be undone without touching workspace data.

## 8. Uninstall / remove data

- `DELETE /api/nova/life/data` removes this user's records (permissions are kept so
  the app stays usable).
- `GET /api/nova/life/export` downloads everything first — do that before deleting.
- To remove the install entirely: stop the app, delete `.nova-life/` (database and
  simulation backups), and remove `node_modules`/`dist`.

## 9. Deployment notes

- The app must serve `/api/nova/life` from a Node runtime. On Vercel that is the
  existing serverless function. The deployment directory is read-only, so when
  `NOVA_LIFE_DB` is unset the engine falls back to the OS temp directory
  (`/tmp/nova-life/life.sqlite`) instead of failing with `ENOENT`, and `/status`
  reports `storage.path: "temporary file"` with `storage.ephemeral: true` (the
  UI shows a **Temporary storage** chip). That database does **not** survive a
  restart — set `NOVA_LIFE_DB` to persistent storage, or use the Supabase mirror,
  if the records must last.
- The life router has no authentication of its own (see
  `NOVA_SECURITY_MODEL.md` §8). Put it behind the platform's auth if it is
  publicly reachable.
- Rate limiting: 120 requests/minute for `/api/nova/life` (separate key from the
  chat endpoints).
- `NOVA_LOCAL_ONLY=1` in production is recommended unless you deliberately want
  cloud inference.

## 10. Troubleshooting installs

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ERR_MODULE_NOT_FOUND: express` | running a script from outside the repo | run from the repo root |
| `node:sqlite` not found | Node < 22.5 | upgrade Node |
| FTS unavailable (`storage.fts: false`) | Node built without FTS5 | search falls back to `tokens`; rebuild Node for FTS |
| `SQLITE_CANTOPEN` | `NOVA_LIFE_DB` directory missing or not writable | create the directory, fix permissions |
| 401/403 from Supabase migration | applying as `anon` | apply as the project owner; RLS has no `anon` grants by design |
| UI tab shows "The engine did not answer this request." | engine unreachable, payload includes the code | check the server log for that code |
| `npm test` hangs | SQLite handle keeps the loop alive | scripts already pass `--test-force-exit`; use the npm scripts |
