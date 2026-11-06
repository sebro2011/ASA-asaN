# NOVA AI — premium light UI: audit, plan, delivery

## 1. Audit (what exists before this change)

| Area | State |
| --- | --- |
| Stack | React 19 · Vite 8 · Tailwind 4 · framer-motion 13 · lucide-react · i18next (en/si/ta) — no new dependency needed |
| Design system | `src/styles/nova-tokens.css` defines `--color-ws-*` for **dark and light**, plus `--ws-glass`; `workspace.css` has `.nova-card`, `.nova-glass`, `.nova-btn`, `.nova-nav-item` |
| Theme | `data-nova-theme` on `<html>`, preference in localStorage, `system` supported, reduced-motion and high-contrast attributes honoured |
| Shell | Sidebar (collapsible, a11y-labelled), mobile drawer, bottom bar, command palette (⌘K), all under test |
| Home (`/`) | Greeting, Explore card, module roadmap, appearance, live provider status, cloud status |
| Chat (`/chat`) | Conversation list (filter, archive, rename, soft delete), thread, ⌘-toggleable provider select, typewriter reveal, error taxonomy with code + HTTP status, offline-answer disclosure |
| AI engine | `POST /api/nova/chat` → arena → openrouter → gemini → bundled local engine. **Preserved untouched** |
| Gaps found | No copy / regenerate / stop controls, no way to start a conversation from Home, no orb or input on the dashboard |

## 2. Decisions

1. **Preserve the engine.** Nothing in `server/novaChat.js` changed. No key ever reaches the client.
2. **Light-first, not light-only.** The new surfaces are built on the existing tokens, so both themes work; "premium light" is the showcase, but the stored/system preference still wins. Flipping the default is a one-line change in `src/app/theme.tsx` (left to the owner).
3. **No dead controls.** The brief asks for attachments, voice input and streaming. The deployment has **no upload endpoint, no speech-to-text and no SSE chat route**, so those controls are deliberately *not* added — a button that cannot work contradicts the project rule that nothing may pretend to work. Text prompt, provider ("source") selection, keyboard shortcuts, loading/error/empty states and stop-generation are real and implemented.
4. **Motion budget.** The orb animates transform/opacity only (GPU), pauses on `prefers-reduced-motion` and on the in-app Reduce-motion setting, and is a plain `div` tree — no three.js, no canvas loop.

## 3. Phases

| Phase | Content | Status |
| --- | --- | --- |
| 1 | Orb (`NovaOrb`) with idle / thinking / listening / generating states, CSS + framer-motion, reduced-motion safe | done |
| 2 | Home dashboard: orb hero, greeting, prompt chips, glass composer, quick-action cards (all real destinations), quieter roadmap | done |
| 3 | Composer hand-off: Home → `/chat` via a session-scoped pending prompt that the chat surface consumes once | done |
| 4 | Chat controls: copy, regenerate (replaces the previous answer), stop generation (abort) | done |
| 5 | i18n in en/si/ta, tests, build | done |

## 4. Test surface

- `scripts/test-workspace-home.mjs` — orb renders one `role="img"` with the state label, reduced-motion keeps it static, composer sends a prompt to `/chat` exactly once, quick actions point at real routes.
- `scripts/test-workspace-chat.mjs` — copy, regenerate and stop.
- Existing suites unchanged: shell, dom, settings, search, auth, sync, SQL, server, security.
