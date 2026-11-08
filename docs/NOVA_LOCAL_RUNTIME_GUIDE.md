# NOVA local runtime guide

How the engine runs on a machine you control: which process serves it, which
providers it can reach, how it picks a model, and what it refuses to do.

---

## 1. What runs where

| Part | Process | Notes |
| --- | --- | --- |
| NOVA app + `/api/nova/life` | `server.ts` (Node, Express) | one process; the life router owns a SQLite file |
| NOVA UI `/intelligence` | served by the same app | the browser only calls `/api/nova/life/*` |
| Model provider | separate process, e.g. Ollama on `127.0.0.1:11434` | the app does not start or download models |
| Database | SQLite file at `NOVA_LIFE_DB` or `<cwd>/.nova-life/life.sqlite` | WAL mode; FTS5 when the Node build has it |

There is no daemon, no scheduler and no background indexing loop. Everything
happens in response to a request.

## 2. Environment

```bash
# storage
NOVA_LIFE_DB=/home/me/.nova/local/life.sqlite

# safety switches
NOVA_LOCAL_ONLY=1            # no cloud provider may be called
NOVA_LIFE_ALLOW_EXECUTE=0    # 1 enables the tests.run tool (still needs grant + approval)

# hardware (declared, never guessed)
NOVA_RESOURCE_PROFILE=balanced   # low | balanced | high
NOVA_GPU_VRAM_GB=8               # only if you actually have one
NOVA_GPU_VENDOR=nvidia

# local model servers
OLLAMA_BASE_URL=http://127.0.0.1:11434
NOVA_LOCAL_MODEL=llama3.1:8b
NOVA_LOCAL_CONTEXT=8192
OPENAI_COMPAT_BASE_URL=http://127.0.0.1:8000     # vLLM / LM Studio / llama-server
LLAMA_CPP_BASE_URL=http://127.0.0.1:8080
NOVA_LOCAL_TIMEOUT_MS=60000

# optional cloud (only used when configured and LOCAL_ONLY is off)
OPENROUTER_API_KEY=
GEMINI_API_KEY=
NOVA_GEMINI_MODEL=
```

`NOVA_ALLOW_REMOTE_LOCAL=1` is required if you point `OLLAMA_BASE_URL` at a
non-loopback host; otherwise the adapter treats a remote "local" endpoint as a
cloud endpoint for policy purposes.

## 3. Starting a local model server

Ollama (the adapter uses `/api/tags` for the model list, `/api/chat` for
generation, `/api/ps` for loaded models, `/` for health):

```bash
ollama serve
ollama pull llama3.2:3b      # a small model for a laptop
curl -s http://127.0.0.1:11434/api/tags | head
```

llama.cpp server, vLLM or LM Studio (OpenAI-compatible, `/v1/models` and
`/v1/chat/completions`):

```bash
llama-server -m ./models/qwen2.5-7b-instruct.gguf --port 8080
curl -s http://127.0.0.1:8080/v1/models
```

The engine never downloads weights. If a model is absent, health reports the
provider as unreachable and `/providers/select` fails with
`LOCAL_ONLY_NO_PROVIDER` rather than fetching anything.

## 4. Hardware profiles

`hardware.js` reads `os.cpus()`, `os.totalmem()`, `os.freemem()` and
`os.loadavg()`, and raises a profile only when the numbers support it:

| Profile | Context | Concurrent models | Concurrent tasks | Background jobs |
| --- | --- | --- | --- | --- |
| `low` | 2 048 | 1 | 1 | 0 |
| `balanced` | 8 192 | 1 | 2 | 1 |
| `high` | 32 768 | 2 | 4 | 2 |

Rule used by `inferProfile()`: `high` when total RAM ≥ 32 GB *and* (declared VRAM
≥ 8 GB or load per CPU < 1.5); `balanced` at ≥ 12 GB RAM, or ≥ 8 GB with ≥ 3 GB
free; otherwise `low`. GPU VRAM is
only reported when `NOVA_GPU_VRAM_GB` is set — the engine does not probe the GPU.
`contextBudget(hardware, requested)` caps every request to the profile's context
window, so an 8k-context profile cannot ask a model for 32k tokens.

`canLoadModel(hardware, model, loadedGb)` and
`estimateModelMemoryGb({parametersB, quantisationBits, contextTokens})` are
available for pre-flight checks. They estimate; they do not guarantee a fit.

## 5. Model selection

`POST /api/nova/life/providers/select` with `{ complexity, json, tools }` walks the
configured providers in order (local first) and returns the first that satisfies
the request:

| Complexity | Preference order (local) |
| --- | --- |
| `simple` | `llama3.2:3b`, `qwen2.5:3b`, `phi3:mini`, `gemma2:2b` |
| `standard` | `llama3.1:8b`, `qwen2.5:7b`, `mistral:7b`, `gemma2:9b` |
| `complex` | `qwen2.5:14b`, `llama3.1:8b`, `mistral-nemo:12b` |

`NOVA_LOCAL_MODEL` overrides the choice entirely. Observed behaviour on a test
host without a GPU: `standard` resolves to `llama3.2:3b` because it is the
smallest configured capable model — the engine does not pretend to run an 8B
model on a machine that cannot hold it.

Providers: `ollama`, `openai-compatible`, `llama-cpp`, `openrouter`, `gemini`.
Cloud providers require `transmit.external` **and** a recorded approval per call;
`NOVA_LOCAL_ONLY=1` refuses them before any socket is opened
(`LOCAL_ONLY_BLOCKED`).

## 6. Dedicated local-only mode

With `NOVA_LOCAL_ONLY=1`:

- `/status` reports `mode.localOnly: true`;
- `/providers/health` marks cloud providers `blocked` with detail `LOCAL_ONLY`;
- any generation request with no reachable local model fails
  `LOCAL_ONLY_NO_PROVIDER` (503) — no silent fallback to a cloud key;
- `/config` still lists cloud providers so you can see what *would* be used, with
  `configured: false` when no key is present.

This is the recommended setting for private data.

## 7. Embeddings (optional)

`NOVA_EMBED_MODEL` names an embedding model exposed by the local provider. When
it resolves, memory search adds a cosine term (`fts+vector`); when it does not,
search stays `fts` and the response says so. No embedding is invented, and
nothing is sent to a cloud embedding service unless `transmit.external` is
granted.

## 8. Health checks

```bash
curl -s localhost:3000/api/nova/life/status | jq '{mode, counts, storage}'
curl -s -X POST localhost:3000/api/nova/life/providers/health | jq '.providers[] | {id, status, ok, detail}'
```

A healthy local-only install with no model running reports the Ollama provider
as `ok: false` with the connection error in `detail`, and `localAvailable: false`.
That is the honest state, not a failure of the app.

## 9. Troubleshooting

| Symptom | Meaning | Fix |
| --- | --- | --- |
| `LOCAL_ONLY_NO_PROVIDER` (503) | local-only, nothing reachable | start Ollama or a compatible server; check `OLLAMA_BASE_URL` |
| `LOCAL_ONLY_BLOCKED` (403) | a cloud provider was requested in local-only mode | unset `NOVA_LOCAL_ONLY` if you really want cloud |
| `PROVIDER_NOT_CONFIGURED` | no key/base URL for that provider | set the key or leave it disabled |
| `PROVIDER_UNREACHABLE` / `AI_TIMEOUT` | no answer within `timeoutMs` (60 s default, 180 s max) | start the server, pull the model, or raise the timeout |
| `PROVIDER_AUTH_ERROR` after a timeout | the generation probe timed out, then the metadata key check was rejected | the key is invalid/expired — issue a new one; the diagnostics payload carries `keyValid: false` |
| `AI_TIMEOUT` with `keyValid: true` | the key is fine, the model did not answer in 20 s | check quota/model availability; the probe no longer blames the key |
| `TOOL_DISABLED` | `tests.run` was called with execution off | `NOVA_LIFE_ALLOW_EXECUTE=1` (and grant + approval) |
| `EXECUTION_DISABLED` | direct call reached the tool's own guard | same as above |
| `LOCAL_ONLY` in provider detail | health check refused a cloud call by policy | expected |
| `SECRET_IN_MEMORY` (422) | text looked like a credential | store the fact, not the key |
| `PATH_OUTSIDE_ROOT` (403) | a tool or simulation path escaped the project | use a relative path inside the repo |
| ExperimentalWarning about SQLite | `node:sqlite` is flagged experimental on Node 22 | harmless; silence with `--no-warnings` in scripts |

## 10. Resource expectations

Measured on this branch: the seven benchmark cases finish in ~27 ms total on an
in-memory database, and the full 401-test suite runs in about 90 s. Nothing in
the engine keeps a timer alive after a request; the test scripts pass
`--test-force-exit` because the SQLite handle stays open otherwise.
