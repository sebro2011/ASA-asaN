# NOVA AI — OpenRouter deployment notes

NOVA sends same-origin `POST` requests to `/api/nova/chat`. On Vercel, that URL is provided by the Node function in `api/nova/chat.js`; the Vite frontend remains a static build. The local Express server exposes the same handler at the same path for development.

## Provider and model

The server calls OpenRouter's Chat Completions endpoint and selects `openrouter/free`, OpenRouter's free-model router. It chooses from currently available free models; the actual model used is returned in the response and displayed in the chat. Free-model availability, speed, language quality, and rate limits can vary.

## Configure the secret

In **Vercel → Project → Settings → Environment Variables**, add a variable named exactly:

```text
OPENROUTER_API_KEY
```

Add it to both **Production** and **Preview** (and **Development** only if using Vercel's local tooling). Keep the value server-side: do not prefix it with `VITE_` or `NEXT_PUBLIC_`, put it in frontend code, or commit it. A preview deployment can use a separate, restricted OpenRouter key if desired.

For local `npm run dev`, set `OPENROUTER_API_KEY` in an ignored `.env` file or in the server process environment. `.env*` files are ignored by Git; commit only the empty placeholder in `.env.example`.

## Redeploy after environment changes

Vercel environment variables are applied to deployments, not retroactively to an already-built deployment. After adding or changing the key, create a new deployment or redeploy the existing commit in the matching environment. Test Preview first, then deploy/redeploy Production after Preview succeeds. No `vercel.json` override is required for the repository's Vite build plus root-level `api/` function.

## Operational notes

- The function rejects requests over 24 KiB, more than 12 messages, messages over 4,000 characters, and conversation content over 20 KiB.
- It applies an in-memory limit of 8 requests per IP per minute per warm function process. Serverless instances do not share this memory; use Vercel edge rate limiting for a deployment-wide quota on a public production app.
- A free-model outage or rate limit returns a retryable error; the client uses a clearly labelled local response only when the browser is offline.
- Chat text is sent to OpenRouter for generation. This handler does not log prompts or credentials; hosting-platform request logs and OpenRouter's data-handling policies are governed by those providers. Avoid sending sensitive personal information.
