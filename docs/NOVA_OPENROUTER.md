# NOVA AI — Local, Gemini, and OpenRouter setup

NOVA uses a single same-origin chat API: `POST /api/nova/chat`. Vercel serves it through `api/nova/chat.js`; the local Express server exposes the same handler during `npm run dev`. The bundled local space engine is always available, including when no API keys are configured.

## Provider modes

The NOVA chat provider selector offers:

- **Auto** — tries configured online providers in this order: OpenRouter, then Gemini. If neither is configured or both fail, NOVA answers with the bundled local space-knowledge engine.
- **Local** — runs the bundled `src/utils/spaceLocalAiEngine.js` in the browser. No server request, external key, or internet connection is needed after the app has loaded.
- **Gemini** — sends chat requests to Google Gemini using `GEMINI_API_KEY`.
- **OpenRouter** — sends chat requests to OpenRouter using `OPENROUTER_API_KEY` and the selected model.

The UI receives only provider availability flags from `GET /api/nova/config`; it never receives API key values. NOVA does not log conversation prompts or key values. When Auto falls back to the local engine, the response is labeled **NOVA Local Space Engine** rather than presented as a Gemini/OpenRouter answer. The built-in engine is a deterministic, trilingual NASA/space knowledge and intent engine—not a downloaded local LLM.

## Configure keys

### Local development

Copy `.env.example` to an ignored `.env` file and add one or both server-only keys:

```dotenv
GEMINI_API_KEY="your-gemini-key"
OPENROUTER_API_KEY="your-openrouter-key"
```

Do not add a `VITE_` or `NEXT_PUBLIC_` prefix. Restart `npm run dev` after changing the environment. Without either key, NOVA still works in Local and Auto modes using its bundled engine.

### Vercel

In **Vercel → Project → Settings → Environment Variables**, add `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, or both to the Production and Preview environments as needed. Keep both values server-side; never put them in client-side code, browser storage, or frontend-prefixed variables. After changing environment variables, redeploy so the new function runtime receives them.

## Models and routing

Defaults are `gemini-2.5-flash` and OpenRouter's `openrouter/free` router. Set `NOVA_GEMINI_MODEL` or `NOVA_OPENROUTER_MODEL` server-side to override either model. The OpenRouter key can be used with any model available to that key; free-model availability and rate limits can vary.

## Limits and privacy

- Requests are limited to 24 KiB, 12 messages, 4,000 characters per message, and 20 KiB total message content.
- The in-memory limiter allows 8 NOVA requests per IP per minute per warm server process. For a public deployment-wide quota, configure a distributed rate limiter at the hosting layer.
- Chat content is sent only to the selected online provider. Local mode does not make a provider request. Avoid sending sensitive personal information; provider and hosting data-handling policies still apply.
- Provider keys are read from the server environment and are not returned by `/api/nova/config` or `/api/nova/chat`.
