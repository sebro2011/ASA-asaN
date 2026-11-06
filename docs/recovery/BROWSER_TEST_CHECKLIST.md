# Real browser testing checklist — NASA Space Explorer

**Why this is a checklist and not a results table:** this workspace has no browser
engine (no Playwright, no Chrome, no network to install one) and cannot open a
device camera. Nothing below has been executed. Filling it in requires a real
browser; the automated coverage this repo *does* have is listed in §6.

Rule for this phase: **fix only issues you can reproduce with a screenshot or a
console/network capture.** Anything else becomes a ticket, not a change.

---

## 1. Prerequisites

| Item | How |
| --- | --- |
| Build under test | `npm run build && npm start` (production) and `npm run dev` (dev) |
| Browsers | Chrome (last), Firefox (last), Safari 17+, Edge, and one Android Chrome |
| Devices / viewports | 1440×900 desktop · 1280×800 laptop · 768×1024 tablet · 390×844 phone |
| WebGL check | `chrome://gpu` or <https://get.webgl.org> — record `WebGL 1/2 available` |
| Network conditions | DevTools → Network: *Online*, *Fast 3G*, *Offline* |
| Capture template | feature · viewport · browser · pass/fail · screenshot · console · network |

Sign-in state matters for half the app: test once **signed out** (cloud unconfigured
or no session) and once **signed in** where relevant.

---

## 2. Per-feature checklist

### 2.1 APOD — `/`, "APOD" tab
- [ ] Image, title, date and explanation render; credit/source line present.
- [ ] Next/previous day navigation reaches the API range limits gracefully.
- [ ] If NASA answers with 429/503: fallback image + an explicit "cached copy" label
      (never a blank frame, never a fabricated date).
- [ ] Offline (DevTools → Offline): last cached APOD shows, with the offline badge.
- [ ] Phone: image fits without horizontal scroll; long explanations wrap.

### 2.2 Earth Intelligence Lab — "Earth" tab
- [ ] POWER card loads for a location; values labelled with units and source.
- [ ] GIBS layer renders; date domain comes from the probe, not from "today".
- [ ] Layer switch does not stack canvases (check with the layer picker twice).
- [ ] `not-configured` (no FIRMS key) reads as a statement, not an error toast.
- [ ] Slow 3G: skeletons, then either data or a typed error — never an infinite spinner.

### 2.3 ISS / orbit tracking
- [ ] Live position updates every few seconds; timestamp is visible.
- [ ] Fallback position (if the API fails) is labelled as last known.
- [ ] Map pan/zoom does not recentre-jump on each refresh.
- [ ] Phone: map is usable, no scroll trapping.

### 2.4 3D Space Viewer
- [ ] WebGL available: scene loads, orbit controls respond, no console errors.
- [ ] **WebGL disabled:** a clear fallback screen (not a black rectangle).
- [ ] Context lost (`WEBGL_lose_context` in console) → recoverable message.
- [ ] Phone: 30 s interaction without frame drops; battery/perf panel shows no runaway loop.
- [ ] Reduced motion: auto-rotation stops.

### 2.5 AR Planet Viewer
- [ ] Camera permission prompt appears once; deny → explanation + retry path.
- [ ] iOS Safari and Android Chrome both reach a working AR/3D fallback.
- [ ] No camera request on page load — only after an explicit tap (check the URL bar
      camera indicator).
- [ ] Permission revoked mid-session → graceful stop, no freeze.

### 2.6 Rocket Launch Simulator
- [ ] Launch countdown, abort and reset all reach a defined end state.
- [ ] Frame timing stays smooth on the phone viewport.
- [ ] Leaving the tab mid-simulation stops the animation loop (no battery drain).

### 2.7 Mars Rover imagery
- [ ] Gallery loads; image metadata (sol, camera, earth date) shown from the API.
- [ ] Missing/broken image URLs degrade to a placeholder, not a broken icon.
- [ ] Tagging a "favourite" persists across reload.
- [ ] 404/503 from the API shows a retry, not an empty gallery.

### 2.8 NOVA assistant (inside Explore and `/workspace` chat)
- [ ] Ask a question: answer arrives, provider + model are shown.
- [ ] Offline engine answer is labelled offline and lists failed providers.
- [ ] Stop, copy, regenerate work; regenerate replaces rather than duplicates.
- [ ] Mobile keyboard: composer stays above the keyboard; no layout jump.

### 2.9 Navigation and shell
- [ ] `/` is NASA (title, header, tabs). `/workspace` is NOVA. `/explore/:tab` deep links work.
- [ ] Back/forward traverse tabs correctly; refresh keeps the tab.
- [ ] Sinhala and Tamil: no clipped buttons, no fallback-to-English strings.
- [ ] Lighthouse mobile: performance ≥ 80, no accessibility violations on `/`.

---

## 3. Error-state matrix (run once per surface)

| Condition | Expected |
| --- | --- |
| API unreachable | typed message + retry; no console exception |
| API 429 | "busy, retry in N s" — matches the `Retry-After` |
| API 503 (no key) | "not configured" statement, not a crash |
| Offline | cached data with an offline badge, controls disabled where writes would fail |
| Slow 3G | skeleton → resolution, no double render |
| Reduced motion | animations stop; nothing becomes unreachable |

---

## 4. WebGL / permission specifics

- `WEBGL_lose_context` → the viewer must show a recoverable state.
- `prefers-reduced-motion: reduce` → no auto-rotate, no parallax.
- Camera: only on explicit tap; on deny, the AR entry point explains and offers the
  3D fallback.
- Check `Permissions-Policy` in the response headers allows `camera` where AR runs
  (`server.ts` currently sends `camera=()` — **if AR needs the camera this must be
  scoped to the AR route; confirm in the browser before changing it**).

---

## 5. Recording results

```
Feature      | Viewport | Browser | Result | Console | Network | Evidence
APOD         | 390×844  | Chrome  | PASS   | clean   | 200     | apod-phone.png
3D viewer    | 1440×900 | Safari  | FAIL   | WebGL   | —       | 3d-safari.png
```

Attach the screenshot and the copied console/network lines. A failure without
evidence stays a hypothesis.

---

## 6. What is already covered automatically

`npm test` (282 checks) covers: routing (`/` NASA, `/workspace` NOVA, `/explore/:tab`),
the workspace shell on desktop/tablet/phone breakpoints, Explore mounting its
destinations, i18n parity for all three languages, the chat lifecycle (send, error
taxonomy, stop, regenerate, pending prompt), every API route's contract, and the
env/secret audit. It does **not** cover WebGL, camera permissions, real paint or
real network — which is exactly what this checklist is for.
