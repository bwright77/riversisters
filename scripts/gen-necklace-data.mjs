// Generates /data/necklace.geojson and /data/necklace.i18n.json from the REAL
// coordinate + copy arrays that already live in index.html. Single source of
// truth stays index.html; this script just re-projects that data into the
// formats the expanded (MapLibre) view consumes. Re-run after editing the
// `parks`, `RIVER`, or `CK` arrays in index.html.
//
//   node scripts/gen-necklace-data.mjs
//
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

function grab(re, label) {
  const m = html.match(re);
  if (!m) throw new Error(`Could not locate ${label} array in index.html`);
  // eslint-disable-next-line no-eval
  return (0, eval)('(' + m[1] + ')');
}

const parks = grab(/const parks=(\[[\s\S]*?\]);\s*\nconst svg=/, 'parks');
const RIVER = grab(/const RIVER=(\[\[[\s\S]*?\]\]);/, 'RIVER');
const CK = grab(/const CK=(\[\[[\s\S]*?\]\]);/, 'CK');

if (parks.length !== 23) throw new Error(`Expected 23 beads, got ${parks.length}`);

// ---- slug ids (stable, derived from English name) ----
const idFor = (en, order) =>
  en.toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `bead-${order}`;

const beads = parks.map((p, i) => ({
  id: idFor(p.en, i + 1),
  order: i + 1,
  ...p,
}));

// ---- GeoJSON: real [lng, lat] geometry (arrays are already lon-first) ----
const geojson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'South Platte River', kind: 'river' },
      geometry: { type: 'LineString', coordinates: RIVER },
    },
    {
      type: 'Feature',
      properties: { name: 'Cherry Creek', kind: 'creek' },
      geometry: { type: 'LineString', coordinates: CK },
    },
    ...beads.map((b) => ({
      type: 'Feature',
      properties: {
        id: b.id,
        order: b.order,
        name_en: b.en,
        name_es: b.es,
        pendant: !!b.pendant,
        approx: !!b.approx,
      },
      // parks store {lat, lon}; GeoJSON wants [lng, lat]
      geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
    })),
  ],
};

// ---- Bilingual step copy, keyed by bead id ----
const i18n = {};
for (const b of beads) {
  i18n[b.id] = {
    order: b.order,
    en: { heading: b.en, body: b.nEn },
    es: { heading: b.es, body: b.nEs },
  };
}

mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data/necklace.geojson'), JSON.stringify(geojson, null, 1) + '\n');
writeFileSync(join(root, 'data/necklace.i18n.json'), JSON.stringify(i18n, null, 2) + '\n');

const approx = beads.filter((b) => b.approx).map((b) => `#${b.order} ${b.en}`);
console.log(`Wrote data/necklace.geojson (${beads.length} beads, river ${RIVER.length} pts, creek ${CK.length} pts)`);
console.log(`Wrote data/necklace.i18n.json`);
console.log(`Approximate bead locations (carry "approx" flag, confirm w/ Congreso): ${approx.join('; ')}`);
