# NOVA workspace v5 — thinking ladder, astronomy studio, one AI surface

This note describes the workspace changes in this branch. Everything below is
implemented; nothing is aspirational copy inside the product.

## 1. One AI surface

The legacy in-Explore assistant (`src/components/NasaAi.jsx`, the "NOVA
Assistant" tab) has been removed. There is now exactly one AI surface: the NOVA
chat workspace at `/chat`.

- `/explore/assistant` is retired. The route still resolves, and `App` rewrites
  the URL to `/chat` once, so old bookmarks and shared links keep working.
- Explore's header keeps an "Ask NOVA" button — it now opens `/chat`.
- Explore's footer group "Assistant" became "Library" (Saved Research only), and
  the mobile tab bar no longer offers a second, older chat.

The legacy `nasa_ai_chat_thread_v3` localStorage thread is **not** deleted; the
existing opt-in import on the Profile screen still migrates it.

## 2. Thinking ladder

Ordered, fastest → deepest. The order is a product contract and is identical on
the server (`server/novaThinking.js`) and in the browser
(`src/workspace/chat/thinking.ts`).

| Level | OpenRouter `reasoning.effort` | Token budget | Gemini `thinkingLevel` |
| --- | --- | --- | --- |
| `auto` | — (deployment default) | 1200 | `low` (Gemini 3.x) |
| `flash` | — | 700 | `low` |
| `flash-thinking` | `low` | 1400 | `medium` |
| `thinking` | `medium` | 2200 | `medium` |
| `deep-thinking` | `high` | 3200 | `high` |

How it is wired:

- `POST /api/nova/chat` accepts `thinking` (`auto` by default). It is validated
  (`INVALID_THINKING` on an unknown value), applied to the provider payload, and
  echoed in the response so the UI never guesses what ran.
- `auto` is byte-for-byte the previous behaviour: `temperature: 0.7`,
  `max_tokens: 1200`, no `reasoning` block. Existing deployments and tests are
  unaffected.
- The four explicit levels send OpenRouter's `reasoning.effort` and drop
  `temperature` (reasoning models ignore or reject sampling knobs). Gemini gets
  `thinkingConfig.thinkingLevel`; Arena endpoints are OpenAI-compatible but not
  guaranteed to accept `reasoning`, so they receive the budget and a system
  prompt instruction instead of an unknown field.
- Each level may pin its own OpenRouter model:
  `NOVA_OPENROUTER_FLASH_MODEL`, `NOVA_OPENROUTER_FLASH_THINKING_MODEL`,
  `NOVA_OPENROUTER_THINKING_MODEL`, `NOVA_OPENROUTER_DEEP_THINKING_MODEL`. This
  is how "flash thinking" can point at a thinking-capable variant while "flash"
  stays cheap.
- `GET /api/nova/config` returns the ordered ladder under `thinking.levels`,
  with `available` (true only when the deployment can actually serve it) and
  `requiresReasoning`. No key ever appears in that payload.
- The browser remembers the chosen level per device
  (`nova_thinking_level_v1`) and the picker is keyboard-complete: `listbox`,
  arrow keys, Home/End, Enter/Space, Escape, click-outside.

## 3. Astronomy studio

The chat empty state and the dashboard both ship four grounded space-science
starters, each paired with the thinking level that suits it:

| Starter | Level | What it asks for |
| --- | --- | --- |
| Mission briefing | `thinking` | Artemis objectives, hardware and milestones; settled vs. recently changed |
| Visible sky | `flash-thinking` | Moon, planets, easy constellations — asks for hemisphere instead of inventing times |
| NEO risk | `thinking` | Torino scale, size vs. orbit uncertainty vs. impact probability |
| Earth observation | `flash` | What NASA POWER/GIBS measure and how to read a map without over-claiming |

Plus a "Deep space question" starter (`deep-thinking`) that asks for a worked
astrophysics derivation, and a **Picture of the day** action in chat that fetches
the real `/api/apod` entry, quotes its caption verbatim, and seeds a prompt that
asks NOVA to separate what the image shows from interpretation. When APOD falls
back to a cached reference entry, the UI says so.

All copy exists in English, Sinhala and Tamil (`src/i18n/workspaceCopy.ts`).

## 3b. Chat without an account

`/chat` is no longer wrapped in `RequireAuth`. The session state decides where a
thread lives:

| State | Storage | What the surface says |
| --- | --- | --- |
| Signed in | Supabase (`conversations` / `messages`, RLS) | normal, with sync badge |
| Signed out / cloud unconfigured | localStorage (`nova_local_chat_v1`) | "This device only" + a sign-in link |

- The guest store is versioned, capped (40 conversations, 800 messages) and
  validated on read; a corrupt payload is ignored rather than repaired in place.
- A failed device write marks the bubble "not saved" — it never pretends.
- Signing in does **not** silently merge guest rows; the copy says threads stay
  in this browser until you sign in, and no upload happens automatically.
- The dashboard composer no longer detours to `/profile` for guests: a prompt is
  queued and delivered to `/chat` exactly as it is for a signed-in reader.

## 4. UI/UX

The chat surface is a modern two-pane workspace:

- conversation rail: search, All/Archived switch with counts, pin/rename/archive
  /delete on hover or focus, relative timestamps;
- sticky head: conversation title, live provider, current thinking level, new
  chat;
- transcript: avatars, assistant/user bubbles, markdown rendering, copy and
  regenerate on the last answer, a real "thinking" indicator that names the
  level, and an error bubble that keeps the provider, code and HTTP status;
- composer: floating glass, provider picker, thinking picker, send/stop.

The dashboard gained a reasoning-ladder card (select a level from Home), a
thinking picker inside the hero composer, and the astronomy studio grid. The
level chosen on Home travels with the queued prompt
(`nova_pending_thinking`) so the hand-off is not lost.

## 5. Tests

- `npm run test:nova-chat` covers the ladder order, budgets, effort mapping,
  validation, per-level model pinning, the public catalogue and Gemini levels.
- `npm run test:workspace-chat`, `test:workspace-home`, `test:workspace-dom` and
  `test:workspace-shell` cover the surfaces, copy parity and the retired tab.
