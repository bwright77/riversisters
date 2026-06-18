# Turquoise Necklace — compact map + expandable scrollytelling sidecar

A two-tier feature on the demo site:

- **Compact view** — the existing south-up SVG necklace map already in
  `index.html` (river + 23 beads, no WebGL). Now carries one CTA,
  **“Explore the full Necklace” / “Recorrer el Collar completo.”**
- **Expanded view** — a full-screen modal that lazy-loads MapLibre GL JS and
  flies the camera bead → bead through all 23 parks as Scrollama step cards
  scroll past. Loaded **only on demand** — zero WebGL on initial page load.

## Files

| Path | Role |
| --- | --- |
| `index.html` | Compact map (unchanged geometry) + CTA + `<script type=module>` hook |
| `assets/css/necklace.css` | CTA + overlay/sidecar styles (reuses `:root` tokens) |
| `assets/js/necklace-compact.js` | CTA wiring, modal shell + a11y, lazy import, `#necklace-explore` deep link |
| `assets/js/necklace-sidecar.js` | MapLibre + Scrollama module (dynamically imported on expand) |
| `data/necklace.geojson` | River + creek LineStrings + 23 bead Points (generated) |
| `data/necklace.i18n.json` | Bilingual step copy keyed by bead id (generated) |
| `scripts/gen-necklace-data.mjs` | Regenerates the two data files from `index.html` |
| `vendor/maplibre-gl.{js,css}` | MapLibre GL JS **v5.24.0**, vendored (no CDN) |
| `vendor/scrollama.min.js` | Scrollama **v3.2.0**, vendored (no CDN) |

## Data is real, not fabricated

`index.html` already contains the canonical data, so nothing was invented:

- **23 bead coordinates** live in the `parks` array (City & County of Denver
  Parks GIS — `ODC_PARK_PARKLAND_A` centroids, EPSG:4326, 2026), stored
  **south→north** (downstream). **Sun Valley Riverfront Park** carries
  `pendant:true` and renders as the corridor's hero (a distinct gem in the
  compact map; clay + the “The Pendant” kicker in the expanded view). Three
  carry `approx:true` (estimated / under construction) and show “Approximate —
  to be confirmed”: **Sun Valley, Finback, National Western.**
- **River geometry** reuses the existing centerlines: South Platte **245 pts**,
  Cherry Creek **78 pts** (USGS NHD). Both are already `[lng, lat]`.

`index.html` stays the single source of truth. After editing `parks`, `RIVER`,
or `CK`, re-run:

```bash
node scripts/gen-necklace-data.mjs
```

## Basemap decision (open question §6 / §13.1)

Default mode is **`vector`**: a **keyless** vector basemap (OpenFreeMap, built
on OpenStreetMap data) giving real Denver street/place context. Vector tiles let
the expanded map render **south-up (bearing 180°)** to match the compact necklace
map — north at the bottom, the South Platte flowing *down* the page as you scroll
down (downstream/north) — while keeping street/place labels upright (raster tiles
can't rotate labels). No API key, no token.

The mode is a one-line switch (`BASEMAP.mode`) in `necklace-sidecar.js`:

- `streets` — keyless CARTO Voyager **raster** basemap (north-up only).
- `canvas` — tokenless solid background + our river/bead layers (offline; no
  street context). Used as the automatic fallback if the map can't initialize.
- `maptiler` — vector streets via MapTiler (needs a free key).
- `protomaps` — production path: a self-hosted Denver `.pmtiles` extract
  (needs the pmtiles protocol lib vendored + a hosted extract).

Street/place labels are local-language (English); fully bilingual basemap labels
would need a custom style (§6). The cards, the river, and the bead labels remain
fully bilingual.

## Open questions — how this build resolved them

1. **Canonical 23 parks + coordinates** — used the real ones already in the
   repo; 3 stay flagged `approx`. Not blocked.
2. **Single-file vs modular** — kept the compact view inline (reuses the
   existing SVG) and put the heavy view + vendored libs in separate files,
   honoring “never inline the WebGL lib.” Toggling the CTA off makes the whole
   feature dormant.
3. **Existing necklace map as compact view** — yes, reused as-is.
4. **Overlay vs route** — full-screen `role="dialog"` overlay (recommended).
5. **EN/ES copy** — reused the repo’s existing reviewed bead copy as the step
   text; swap final Congreso copy in `data/necklace.i18n.json`.

**Deep link:** the section id is already `#necklace`, so the expand deep link
uses **`#necklace-explore`** to avoid colliding with the nav anchor.

## Accessibility

`role="dialog"` + `aria-modal`, focus trap, focus return to the CTA,
body-scroll lock, ESC to close. `prefers-reduced-motion` swaps `flyTo` for
`jumpTo`. Keyboard Previous/Next drive the same step logic. A collapsible
ordered list of all 23 parks (names + descriptions) is the map’s text
equivalent. `cooperativeGestures: true` keeps page/overlay scroll from being
trapped by the map.

## Verification status

Built and statically verified in a headless, network-restricted sandbox:
syntax-checked, all assets serve 200, data validated (18 GeoJSON features:
2 lines + 23 beads), and every MapLibre/Scrollama API used was confirmed
present in the vendored bundles. **Live browser QA of the interaction
checklist (fly-through, gestures, AT) still needs a run on real hardware** —
no GPU/browser was available here to exercise WebGL end-to-end.
