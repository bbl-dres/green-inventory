# Design review — 20 November 2026

A review of the map page and the Standort detail page for consistency, tokens,
colour, contrast, spacing, typography and responsive behaviour. The aim: one
calm, professional look, with nothing on screen that does not earn its place.
Findings marked **fixed** were implemented with this review; **open** ones are
recommendations.

## Method

Everything below was measured in headless Chromium, not judged by eye alone.

- **Computed styles** of every visible element, read in the browser: font
  family, size, weight, line height, text colour against its background (WCAG
  contrast), corner radius, shadow, and the size of every control.
- **States measured**: the map page with legend, feature card, table and filter
  open at once; the detail page with legend, feature card, a calendar row and
  the export menu open. Each at 1440×900 and at 390×844 with touch input.
- **Screenshots** before and after at 1440×900, 820×1180 and 390×844.
- **Static scan** of the stylesheets for values that bypass the tokens.

Not covered: real devices, Safari and iOS, dark mode (there is none), and the
PDF report.

## Summary

| # | Topic | Finding | Status |
|---|---|---|---|
| 1 | Typography | Buttons, inputs and selects rendered in Arial next to system-ui text | fixed |
| 2 | Typography | No base line height: nine different values, most text on the browser default | fixed |
| 3 | Typography | A 15 px step used four times, between 14 and 16; two tokens for 11 px | fixed |
| 4 | Consistency | Map controls in three looks: three elevations, two radii, two sizes | fixed |
| 5 | Consistency | «Tabelle» and «Legende» pills differed in height, type size, colour and border | fixed |
| 6 | Colour | An open filter panel was shown in warning yellow | fixed |
| 7 | Colour | Selecting a Standort tinted its whole plan blue | fixed |
| 8 | Clutter | Table showed an internal row number, a raw type code and the profile twice | fixed |
| 9 | Clutter | A permanent bar of map credits across the bottom of the map | fixed |
| 10 | Consistency | Uppercase labels in three letter-spacings and two greys | fixed |
| 11 | Tokens | Duplicate and near-duplicate tokens for shadows, radii, tints and reds | fixed |
| 12 | Responsive | Detail page on phones: two kinds of links far below finger size | fixed |
| 13 | Consistency | Header buttons 36 px on the detail page, 32 px on the map page | fixed |
| 14 | Contrast | No failures found | — |
| 15 | Consistency | Two button families remain | open |
| 16 | Consistency | Icons in five sizes | open |
| 17 | Clutter | «ausserhalb» on most legend rows when zoomed in | open |
| 18 | Responsive | Credits cover the «Tabelle» pill on phones until the map is first moved | open |
| 19 | Responsive | Calendar rows are buttons that do nothing on narrow screens | open |

## What was measured

### Typography

| Measure (map page, 1440×900) | Before | After |
|---|---|---|
| Font families in use | system-ui 747 · Arial 33 · Helvetica Neue 2 text elements | system-ui only (monospace for coordinates and codes) |
| Line height | browser default on 721 of 783 text elements | 1.4 on 310 of 334 |
| Type sizes in use | 11 · 12 · 13 · 14 · 15 · 16 · 18 | 11 · 12 · 13 · 14 · 16 · 18 |

The Arial came from form controls, which do not inherit the page's font family
unless told to. On phones it was most visible: tabs, search fields and the page
size selector sat in a different typeface from everything around them.

The type scale is now eight steps, each with one job:

| Token | Size | Used for |
|---|---|---|
| `--text-xs` | 11 px | uppercase labels, badges, footer |
| `--text-meta` | 12 px | secondary text: legend rows, captions, card footers |
| `--text-sm` | 13 px (14 px on touch) | body text of the interface |
| `--text-base` | 14 px | page default |
| `--text-title` | 16 px | card, panel and app titles |
| `--text-lg` | 18 px | close icons |
| `--text-kpi` | 24 px | KPI values |
| `--text-h1` | 30 px | page title |

### Contrast

Every visible text element was tested against its actual background. No element
fell below WCAG AA (4.5:1, or 3:1 for large text) on either page at either
size, before or after. The lowest pairs in regular use are `--grey-500` on
white (4.7:1) and `--primary` on `--primary-bg` (5.8:1, the new active state of
the filter button).

### Controls

Heights of clickable elements on the map page at 1440×900:

| | Heights in use |
|---|---|
| Before | 24 · 26 · 27 · 28 · 29 · 30 · 32 · 34 · 36 · 39 · 46 |
| After | 24 · 26 · 27 · 28 · 30 · 32 · 33 · 34 · 36 · 46 |

The 29 px (MapLibre's zoom buttons) and the 39 px («Tabelle» pill) are gone.
What remains follows a ladder:

| Size | Role |
|---|---|
| 24–28 px | icon buttons inside dense rows (legend eyes, close, pager) |
| 32 px (`--ctrl-h`) | header and toolbar controls, map controls |
| 36 px (`--ctrl-h-md`) | card and page actions, the two map pills |
| 44 px | every one of the above on touch input |

### Shape and elevation

| | Before | After |
|---|---|---|
| Corner radii in use | 2 · 3 · 4 · 5 · 8 · 12 · 20 px | 2 · 3 · 4 · 5 · 8 px and full capsules |
| Shadow tokens | 12 | 9 |
| Elevations among map controls | 3 | 1 |

`--radius-full` was 20 px, which stops being a capsule above 40 px of height —
the 44 px pills on touch screens had slightly flattened ends. It is 999 px now.

One elevation ladder replaces the per-component shadows:

| Token | Used for |
|---|---|
| `--shadow-xs` | cards on the page |
| `--shadow-sm` | raised chips and tabs |
| `--shadow-md` | controls floating on the map |
| `--shadow-lg` | floating panels and menus |
| `--shadow-modal` | dialogs |

### Tokens

111 custom properties became 103. Removed, with their replacement:

| Removed | Replacement | Why |
|---|---|---|
| `--text-label` | `--text-xs` | both were 11 px |
| `--text-md` (15 px) | `--text-title` or `--text-base` | a step of 1 px between two others |
| `--radius-pill` | `--radius-full` | both mean "capsule" |
| `--shadow-pill` | `--shadow-sm` | identical values |
| `--shadow-map-ctrl` | `--shadow-md` | same shape, 4 points of opacity apart |
| `--shadow-panel` | `--shadow-lg` | same role |
| `--pg-hover` | `--row-hover` | two near-identical light blues |
| `--sp-btn-y` (5 px) | `--sp2` | off the spacing scale, used once |

`--map-perimeter` now refers to `--red` instead of holding a second red one
shade away. The stylesheets contain no colour outside the tokens, and two font
sizes outside them, both deliberate (16 px on a touch select so iOS does not
zoom, and the vendor popup's close button).

## Fixed

### 4. Map controls

Zoom and compass came with MapLibre's defaults (4 px corners, a 2 px ring,
29 px buttons); the basemap button had a drop shadow; the legend pill a third
shadow; the «Tabelle» pill a border and a fourth. All floating map chrome now
shares `--radius`, `--shadow-md` and `--ctrl-h`.

### 5. The two pills

| | «Legende» | «Tabelle» before | «Tabelle» after |
|---|---|---|---|
| Height | 36 px | 39 px | 36 px |
| Text | 13 px semibold, grey-900 | 11 px semibold, grey-500 | 13 px semibold, grey-900 |
| Border | none | 1 px grey | none |

### 6. Active means blue

The header's filter button used the warning yellow of the edit mode while its
panel was open. Yellow now belongs to the edit mode alone, which does change
how the map behaves; an open panel is blue like every other "on" state
(active tab, current page, checked filter).

### 7. Selection

A selected Standort or parcel was filled with 25 % blue, which dulled every
area colour inside it — and that is the state the map opens in when it is
reached from the detail page. Standorte and parcels are now outlined only;
single elements keep the fill.

### 8. Table columns

The default columns of the Pflegeelemente tab were `#`, `Typ`, `Subtyp`,
`Standort`, `Profil`, `Baumart`, `Fläche`. Three of them were noise:

- `#` is the position of a feature in memory and changes with every data update.
- `Typ` showed the internal code (`area`, `tree`, `point`).
- `Subtyp` repeats the profile for areas and the species for trees.

The tab now shows `Typ` (Pflegefläche, Baum, Punktelement), `Profil`,
`Baumart`, `Standort`, `Fläche`. `#` is off in all three tabs, and the table
sorts by Standort instead of by type code. All columns remain available under
«Spalten».

### 9. Map credits

The credits ran as a bar across the bottom of the map, under the «Tabelle»
pill. They now use MapLibre's compact control: shown when the map opens, folded
into the ⓘ button once the map is moved, and printed in full. They are set in
the app's 11 px type; while unfolded they stay right of the pill and below the
basemap button on maps wider than 640 px.

### 10. Uppercase labels

Menu headings, the table head, the card's type line, the calendar head and the
legend key used letter-spacings of .04, .05 and .06 em and two greys. They are
one style now: 11 px, bold, .05 em, `--grey-600`.

### 12–13. Detail page

- On touch screens the geo.admin.ch link was 83×16 px and the footer links
  27 px tall. Both are 44 px now.
- «Zur Karte» sits in the header at 32 px, like the header controls of the map
  page; «Teilen» and «Exportieren» stay at 36 px as page actions.

## Open

### 15. Two button families

`.edit-btn`, `.dd-btn` and `.pg-btn` (header, table toolbar, pagination) and
`.btn` (cards, detail page) are separate rule sets with slightly different
text colour and weight (grey-700 regular against grey-900 medium).
Recommendation: one `.btn` with size modifiers. It touches most of the markup
of the map page, so it is a change of its own.

### 16. Icon sizes

Icons are drawn at 12, 13, 14, 16 and 18 px. Recommendation: 16 px, and 14 px
inside dense rows.

### 17. «ausserhalb»

Rows without features in the current view are greyed and carry the word
«ausserhalb». Zoomed in on one Standort that is most rows of an open group.
The greying alone may be enough, with the word as a tooltip. Left as it is
because the tag was specified in the wireframe.

### 18. Credits on phones

On phones the unfolded credits still cover the «Tabelle» pill until the map is
first moved. Folding them earlier is a question of the attribution terms of
OpenStreetMap, CARTO and swisstopo rather than of design, so it was not
changed.

### 19. Calendar rows on narrow screens

Below 900 px of card width the Pflegekalender hides the months and the tasks,
so its rows have nothing to expand — but they are still buttons. They should
be plain text there.

### Smaller points

- The swatch corners use spacing tokens (2 px and 4 px) as radii; a
  `--radius-xs` would say what is meant.
- Three light-blue tints remain (`--row-hover`, `--row-active`,
  `--primary-bg`); two would do.
- The prototype banner and the Standort markers are the same red. If the
  banner should stand apart, the marker colour is the one to move.
- At 1280×585 a feature card with a pager and a two-line profile name scrolls
  slightly.
