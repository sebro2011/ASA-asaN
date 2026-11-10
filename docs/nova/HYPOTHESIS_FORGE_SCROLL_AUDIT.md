# NOVA Hypothesis Forge — scroll architecture audit and repair

Date: 2026-11-08 · Scope: `src/features/hypothesis-forge/*`, `src/styles/hypothesis-forge.css`,
`src/styles/workspace.css`, shell (`src/app/AppShell.tsx`, `src/app/hooks.ts`).

Symptom report: unreliable scrolling, clipped content, inconsistent layout, elements that
could not be reached. Every item below was verified in the source, not assumed.

---

## 1. Root cause of the scrolling failure

The Forge is a **mode of the chat surface**, so it renders inside the chat shell:

```tsx
<div className="nova-chat-shell nova-chat-shell--forge">
  <section className="nova-chat-main"><ForgeSurface /></section>
</div>
```

`.nova-chat-shell` is deliberately **viewport locked** — in chat mode the thread and the
rail scroll inside it and the document must not:

```css
.nova-chat-shell { height: calc(100dvh - var(--spacing-ws-topbar)); display: flex; }
```

The Forge override changed only the display type:

```css
/* before */
.nova-chat-shell--forge { display: block; min-height: 0; }        /* height inherited! */
.nova-chat-shell--forge .nova-chat-main { overflow-y: auto; }      /* second scroller */
```

Three consequences, all of them the reported symptoms:

1. **The page could not grow.** The shell stayed one viewport tall while the Forge was
   several screens of document content. Content below the fold was painted outside its
   own box.
2. **Sticky chrome broke.** `.nova-topbar` and `.nova-sidebar` are `position: sticky`
   inside `.nova-app`. Because `.nova-app` was effectively only `100dvh` tall (its child
   never grew), the sticky containing block ended immediately, so the top bar and the
   sidebar scrolled away and left content exposed — "layout behaves inconsistently".
3. **A second scroll container appeared.** `overflow-y: auto` on the pane also computes
   `overflow-x` to `auto`, so the pane clipped wide tables, chart popovers and long source
   URLs instead of letting them scroll — "content appears clipped or inaccessible". A
   scroll container whose own height is `auto` cannot scroll vertically at all, so wheel
   and touch input chain unpredictably to the document: scrolling worked in some places
   and not others.

## 2. Scroll ownership model (the rule everything now follows)

| Surface | Scroll owner |
| --- | --- |
| Chat (`/chat`, threads + rail) | the two panes; the document stays fixed at one viewport |
| **Hypothesis Forge and every document-content surface** | **the document** |
| Sidebar navigation | its own `min-height: 0` pane (independent, `overscroll-behavior: contain`) |
| Mobile drawer / command palette | their own panes (fixed overlay) |
| Wide tables, code blocks, tab strip (when it does not fit) | horizontal only, inside the element |

`min-height: 0` is used only where a flex child is *meant* to scroll (sidebar, chat rail,
thread). No document-content container is a scroll container any more.

## 3. Fixes

| # | File | Fix | Bug it removes |
| --- | --- | --- | --- |
| 1 | `hypothesis-forge.css` | `.nova-chat-shell--forge { height: auto; min-height: calc(100dvh - topbar) }` | page could not grow; sticky chrome broke |
| 2 | `hypothesis-forge.css` | `.nova-chat-main` → `overflow: visible; min-width: 0` | nested scroll container + implicit `overflow-x` clipping |
| 3 | `hypothesis-forge.css` | `minmax(320px,1fr)` → `minmax(min(320px,100%),1fr)` (all four grids) | horizontal page scroll at ≤320–360px and inside narrow panes |
| 4 | `hypothesis-forge.css` | `min-width: 0` on `.forge-grid > *`, `.forge-body > *`, `.forge-panel > *` | a 680px table widened its grid track and the page |
| 5 | `hypothesis-forge.css` | `.forge-tablewrap { max-width: 100%; overscroll-behavior-x: contain }` | table scrolled the page instead of itself |
| 6 | `hypothesis-forge.css` | tabs `flex-wrap: wrap` ≤900px | tabs hidden behind an undiscoverable horizontal scroll |
| 7 | `hypothesis-forge.css` | `scroll-margin-top` on `.forge-panel`, `#nova-main` | focused/anchored panel hidden under the sticky top bar |
| 8 | `hypothesis-forge.css` | `@media (pointer: coarse)` → 40px targets | ~30px controls on touch screens |
| 9 | `workspace.css` + `nova-tokens.css` | chat pane reserves `--spacing-ws-mobilebar` ≤**1023px** (was 767px) | bottom bar covered the last controls on portrait tablets |
| 10 | `AppShell.tsx` | `hasMobileBar = !(min-width: 1024px)` drives the content padding | same bug, JS side; the bar hides at `lg`, padding stopped at `md` |
| 11 | `hooks.ts` | reference-counted `useBodyScrollLock` | closing a drawer before a palette left `body { overflow: hidden }` — **the whole app unscrollable** |
| 12 | `ForgeSurface.tsx` | scroll restored to the Forge top on section change | switching from a long section to a short one left the reader at the footer |
| 13 | `ForgeSurface.tsx` | roving tabindex, Arrow/Home/End keys on the tab strip (WAI-ARIA tabs) | tabs were keyboard-reachable only by tabbing through all eight |
| 14 | `ForgeSurface.tsx` | `aria-controls` only on the selected tab | seven tabs pointed at panels that were never in the DOM |
| 15 | `CommandPalette.tsx` | `60vh` → `60dvh`, `overscroll-contain` | result list could run under the mobile browser chrome |

## 4. Deliberately not changed

* Visual language, colours, typography, glass surfaces, animations, section structure,
  investigation engine, evidence/provenance logic — untouched.
* The tab strip was **not** made sticky: it is not a reported defect, and pinning it would
  add a covering layer.
* No global `overflow-x: hidden` was added to `html`/`body`: it would hide the symptom
  while breaking `position: sticky`. Horizontal overflow was fixed at each source.

## 5. Verification

`scripts/test-forge-scroll.mjs` — 15 executed tests, wired into `npm run test:forge`:

* CSS invariants: forge shell `height: auto` with no `calc()` height; content pane
  `overflow: visible`; **no** `overflow-y: auto` anywhere in the Forge stylesheet; no
  `overflow: hidden` on `html`/`body`/`#root`/`.nova-app`; no `100vh`; every `minmax()`
  minimum clamped with `min(…, 100%)`; `min-width: 0` present; table wrapper contained;
  tabs wrap ≤900px; mobile-bar reservation at exactly 1023px backed by the `lg:hidden` bar
  and the matching AppShell threshold; `scroll-margin-top` on jump targets.
* Rendered (jsdom, real `ForgeSurface`): all eight tabs render; selecting each renders its
  own panel with correct `aria-selected`/`aria-controls`/`aria-labelledby`/tabindex;
  Arrow/Home/End move selection and focus and wrap at both ends; section change scrolls to
  the Forge top only when the reading position was lost; stacked overlays never strand the
  body lock, and a pre-existing `body.style.overflow` is restored exactly.

Full suite: **542 tests, 542 pass, 0 fail**. `npm run lint` clean, `npm run build` exit 0.

### What could not be measured here

This environment has no browser: Playwright is not a dependency and cannot be added
(the Chromium download hosts `cdn.playwright.dev` / `storage.googleapis.com` are
unreachable — `ECONNRESET`). jsdom performs no layout, so **no pixel-level assertion is
claimed**. The layout fix is verified structurally (rules) and behaviourally (rendered
DOM); wheel/touch/trackpad scrolling on a real Android tablet still needs one manual pass.
