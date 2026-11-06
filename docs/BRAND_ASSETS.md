# Brand assets — how the artwork becomes the icon set

Source of truth: the commissioned **NASA Space Explorer — Orbital Horizon**
artwork (1536×1024 PNG, semi-transparent vignette, `alpha` mean 0.94 — every
asset below is flattened onto `#04060e` so nothing renders on an unexpected
backdrop).

## Files

| File | Size | Used for |
| --- | --- | --- |
| `public/brand/space-explorer-lockup.webp` | 1440×385 | in-app lockup (WebP, primary) |
| `public/brand/space-explorer-lockup.png` | 720×192 | in-app lockup (PNG fallback) |
| `public/brand/og-image.png` | 1200×630 | `og:image` / `twitter:image` (palette PNG, 385 KB) |
| `public/brand/icon-512.png`, `icon-192.png` | 512, 192 | manifest `any` icons |
| `public/pwa-512x512.png`, `pwa-192x192.png` | 512, 192 | duplicate copies kept for older references |
| `public/pwa-maskable-512x512.png` | 512 | manifest `maskable` — lockup at ~62 % so a circular mask never clips it |
| `public/apple-touch-icon.png` | 180 | iOS home screen (opaque, no alpha) |
| `public/favicon.png`, `public/favicon.ico` | 32, 16/32/48 | browser tab — the lockup's four-point star, which is legible at 16 px where a 4.5:1 wordmark is not |

## Recipe (ImageMagick)

```bash
SRC="NASA Space Explorer_ Orbital Horizon-2.png"

# In-app lockup: NASA + SPACE EXPLORER, tagline cropped off
convert "$SRC" -crop 1440x385+48+296 +repage -strip public/brand/space-explorer-lockup.png
convert public/brand/space-explorer-lockup.png -quality 88 public/brand/space-explorer-lockup.webp

# Social preview: full artwork, cover-cropped to 1200×630, flattened and quantised
convert "$SRC" -resize 1200x630^ -gravity center -extent 1200x630 \
  -background '#04060e' -alpha remove -alpha off -colors 256 public/brand/og-image.png

# Icon tile: blurred copy of the artwork behind a soft-edged lockup
convert "$SRC" -resize 1200x1200^ -gravity center -extent 1200x1200 \
  -blur 0x55 -modulate 55,110,100 -alpha off /tmp/bg.png
convert "$SRC" -crop 1440x450+48+290 +repage -alpha remove -alpha off -resize 1000x /tmp/fg.png
# masks: -alpha off is essential, otherwise CopyOpacity copies an opaque alpha
convert \( /tmp/fg.png -resize 900x \) \
  \( -size 900x282 xc:black -fill white -draw "rectangle 70,55,830,227" -blur 0x45 \) \
  -alpha off -compose CopyOpacity -composite /tmp/fg900.png
convert /tmp/bg.png /tmp/fg900.png -gravity center -composite /tmp/icon-master.png

# Favicon: the star at the heart of the last "A"
convert "$SRC" -crop 90x90+1103+450 +repage -alpha remove -alpha off /tmp/star.png
convert -size 512x512 xc:'#04060e' \( /tmp/star.png -resize 380x \) -gravity center -composite /tmp/favicon-master.png
```

`scripts/generate-brand-icons.mjs` still generates the original NOVA marks from
SVG. It is **not** the pipeline for these files — running it overwrites the
artwork assets, which is why both the script and this document say so.
