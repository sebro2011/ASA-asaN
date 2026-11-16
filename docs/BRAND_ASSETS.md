# Brand assets — COSMORA icon set and social preview

Source of truth: the **COSMORA** brand system — **COSMORA** is the space and
Earth-intelligence platform, **NOVA** is the AI assistant inside it, and NASA is
credited as the open science data provider.

All raster assets are flattened onto deep midnight space navy (`#04060e` /
`#040812`) so nothing renders with unexpected corner halos on iOS, Android, or
social link previews.

## Files

| File | Size | Used for |
| --- | --- | --- |
| `public/brand/og-image.png` | 1200×630 | `og:image` / `twitter:image` (`COSMORA — EARTH INTELLIGENCE · MISSIONS · DEEP SPACE`) |
| `public/brand/icon-512.png`, `icon-192.png` | 512, 192 | manifest `any` icons (COSMORA glowing planet + tilted orbital ring + star node) |
| `public/pwa-512x512.png`, `pwa-192x192.png` | 512, 192 | duplicate copies kept for compatibility |
| `public/pwa-maskable-512x512.png` | 512 | manifest `maskable` — orbital emblem inset inside the safe circle |
| `public/apple-touch-icon.png` | 180 | iOS home screen (opaque, no alpha) |
| `public/logo.png` | 512 | square brand emblem |
| `public/favicon.png`, `public/favicon.ico` | 32, 16/32/48 | browser tab icon |
| `public/brand/nova-mark.svg`, `nova-mark.png` | vector, 256 | NOVA assistant emblem inside the workspace |

In-app headers and the welcome overlay use the inline SVG orbital glyph paired
with a typographic **COSMORA** wordmark (`src/ui/AppHeader.tsx`,
`src/components/WelcomeScreen.tsx`) so text renders crisply at any DPI without a
network decode shift.
