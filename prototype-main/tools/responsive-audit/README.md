# Responsive audit

Playwright harness behind [`docs/RESPONSIVE-REVIEW.md`](../../docs/RESPONSIVE-REVIEW.md).
It loads the main app on 18 device profiles (4K desktop down to a 320 px phone,
including laptops at 125 % / 150 % OS scaling, a 200 % browser zoom and a phone in
landscape), drives it through a set of UI states and records a screenshot plus
layout measurements for every device × state.

## Run

```bash
# 1. serve the repository root (see the top-level README)
python -m http.server 8000

# 2. in this folder
npm install
node audit.js out                       # all devices, all states (~10 min)
node audit.js out p-iphone,d-fhd150     # a subset of devices
node audit.js out p-iphone tap,filter   # a subset of states
node summarize.js out/metrics.json      # one line per device
```

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://127.0.0.1:8000/prototype-main/` | App under test |
| `OFFLINE=1` | off | Serve MapLibre from `node_modules`, replace the basemaps with a plain background and mock the geo.admin search — for networks that block the CDNs. UI chrome is unchanged. |
| `CHROMIUM_PATH` | Playwright's Chromium | Use a system Chromium instead |

## Devices ([`devices.js`](devices.js))

CSS viewport = physical resolution ÷ OS scaling − browser chrome. For example a
1920 × 1080 laptop at 150 % scaling gives 1280 × 720 CSS px, minus the Windows
taskbar and Chrome's tab strip and toolbar = **1280 × 585**. That is the tightest
desktop case.

## States ([`audit.js`](audit.js))

`initial`, `zoomed` (a dense site), `table` (table open), `tap` (tap / click a
feature in the lower part of the map, the case where the auto-opening table used
to cover the popup), `legend`, `basemap`, `filter`, `search`, `columns` (column
picker open) and `context` (right-click; long-press on touch devices).

## Metrics ([`metrics.js`](metrics.js))

Per state: header overflow and search width, map / table / panel sizes, toolbar
clipping, visible table columns, floating-control overlaps, popup visibility (%),
drawer occlusion, basemap picker on-screen, touch targets < 24 px (WCAG 2.5.8) and
< 44 px (Apple HIG), text < 12 px, text contrast < 4.5:1, placeholder contrast,
and inputs < 16 px (iOS zooms the page when they get focus).

`contact-sheet.js` combines screenshots into one image, for example
`node contact-sheet.js sheet.jpg 300 4 "iPhone|out/p-iphone__tap.png" …`.
