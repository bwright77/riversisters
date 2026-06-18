/* ============================================================================
   Turquoise Necklace — expanded scrollytelling sidecar (heavy view).
   Dynamically imported by necklace-compact.js ONLY when the reader expands the
   compact map, so MapLibre + the basemap never touch the initial page load.

   Renders the South Platte + Cherry Creek and all 16 beads in MapLibre GL JS,
   and flies the camera bead -> bead as Scrollama-observed step cards scroll by.

   Data: /data/necklace.geojson + /data/necklace.i18n.json (generated from the
   real coordinate/copy arrays in index.html by scripts/gen-necklace-data.mjs).
   Libraries are vendored in /vendor (no CDN, no API token at runtime).
   ========================================================================== */

const VENDOR = {
  mapJs: '/vendor/maplibre-gl.js',
  mapCss: '/vendor/maplibre-gl.css',
  scrollama: '/vendor/scrollama.min.js',
};
const DATA = {
  geojson: '/data/necklace.geojson',
  i18n: '/data/necklace.i18n.json',
};

/* Palette — mirrors the :root tokens in index.html (read from CSS so a token
   change in one place flows through; falls back to the brief's hexes). */
function token(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
const C = {
  turquoise: token('--turquoise', '#0E8F8C'),
  turquoiseDeep: token('--turquoise-deep', '#0A6B69'),
  river: token('--river', '#1B6FA8'),
  clay: token('--clay', '#C8743C'),
  bone: token('--bone', '#F6F1E8'),
  ink: token('--ink', '#241C14'),
};

/* ---------------------------------------------------------------------------
   Basemap selection.
   'vector'  : DEFAULT. Real Denver street/place context via a KEYLESS vector
               basemap (OpenFreeMap, OpenStreetMap data). Vector lets the map
               rotate south-up to match the compact necklace map with labels
               staying upright. Place/street labels are local-language (English);
               fully bilingual labels would need a custom style (brief §6).
   'streets' : keyless RASTER basemap (CARTO Voyager). North-up only.
   'canvas'  : tokenless solid background + our river/bead layers only. No
               tiles, works offline. Fallback when no basemap is wanted.
   'maptiler': vector streets via MapTiler (free tier; needs a key).
   'protomaps': production path — a self-hosted Denver .pmtiles extract (needs
               the pmtiles protocol lib vendored + a hosted extract).
   --------------------------------------------------------------------------- */
const BASEMAP = {
  mode: 'vector',
  // Keyless VECTOR basemap (OpenFreeMap, OpenStreetMap data). Vector means the
  // map can be rotated south-up (to match the compact necklace map) while
  // street/place labels stay upright — raster tiles can't do that.
  vectorStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  // Keyless RASTER fallback (CARTO Voyager). North-up only — rotating raster
  // tiles turns the labels upside-down.
  rasterTiles: [
    'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  ],
  rasterAttribution:
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
  maptilerKey: '',
  protomapsUrl: '/basemap/denver.pmtiles',
};

// South-up (bearing 180) matches the compact necklace map: north at the bottom,
// the South Platte flowing DOWN the page as you scroll down (downstream/north).
const CAMERA = { zoom: 14.3, bearing: 180, pitch: 0, flyDuration: 1200 };

/* ---- tiny loaders (idempotent) ------------------------------------------- */
const _loaded = {};
function loadScript(src) {
  if (_loaded[src]) return _loaded[src];
  _loaded[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
  return _loaded[src];
}
function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}
async function loadJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to load ${url} (${r.status})`);
  return r.json();
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---- shared necklace overlay (river + creek + beads) --------------------- */
function necklaceSource(geojson) {
  return { type: 'geojson', data: geojson, promoteId: 'id' };
}
function necklaceLayers() {
  const active = ['boolean', ['feature-state', 'active'], false];
  return [
    {
      id: 'creek',
      type: 'line',
      source: 'necklace',
      filter: ['==', ['get', 'kind'], 'creek'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 14, 3.5, 16, 5], 'line-opacity': 0.85 },
    },
    {
      id: 'river',
      type: 'line',
      source: 'necklace',
      filter: ['==', ['get', 'kind'], 'river'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': C.turquoise,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 6, 16, 9],
      },
    },
    {
      id: 'bead-halo',
      type: 'circle',
      source: 'necklace',
      filter: ['has', 'order'],
      paint: {
        'circle-radius': ['case', active, 17, 0],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
        'circle-stroke-opacity': ['case', active, 1, 0],
      },
    },
    {
      id: 'beads',
      type: 'circle',
      source: 'necklace',
      filter: ['has', 'order'],
      paint: {
        // the pendant (Sun Valley) is clay and a touch larger than the beads
        'circle-radius': ['case', active, 10, ['case', ['get', 'pendant'], 8, 6]],
        'circle-color': ['case', ['get', 'pendant'], C.clay, C.turquoise],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['case', ['get', 'pendant'], 2.5, 2],
        'circle-opacity': ['case', active, 1, 0.85],
      },
    },
  ];
}

/* ---- real street basemap (keyless raster) -------------------------------- */
function rasterStyle(geojson) {
  return {
    version: 8,
    name: 'necklace-streets',
    sources: {
      basemap: {
        type: 'raster',
        tiles: BASEMAP.rasterTiles,
        tileSize: 256,
        minzoom: 0,
        maxzoom: 20,
        attribution: BASEMAP.rasterAttribution,
      },
      necklace: necklaceSource(geojson),
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }, ...necklaceLayers()],
  };
}

/* ---- canvas (tokenless) fallback ----------------------------------------- */
function canvasStyle(geojson) {
  return {
    version: 8,
    name: 'necklace-canvas',
    sources: { necklace: necklaceSource(geojson) },
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': C.bone } }, ...necklaceLayers()],
  };
}

function baseStyle(geojson) {
  if (BASEMAP.mode === 'vector') return BASEMAP.vectorStyleUrl;
  if (BASEMAP.mode === 'maptiler' && BASEMAP.maptilerKey) return maptilerStyleUrl();
  if (BASEMAP.mode === 'canvas') return canvasStyle(geojson);
  return rasterStyle(geojson); // 'streets'
}

/* MapTiler vector: load their style, then graft our necklace layers on top. */
function maptilerStyleUrl() {
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${BASEMAP.maptilerKey}`;
}
/* Add our river/bead overlay on top of a URL-based basemap style (vector /
   maptiler), where the necklace layers aren't part of the loaded style. Robust
   to the style not being fully parsed yet. */
function addNecklaceLayers(map, geojson) {
  const add = () => {
    if (!map.getSource('necklace')) map.addSource('necklace', necklaceSource(geojson));
    for (const l of necklaceLayers()) if (!map.getLayer(l.id)) map.addLayer(l);
  };
  try {
    if (map.isStyleLoaded && map.isStyleLoaded()) { add(); return; }
  } catch (e) { /* fall through to deferred add */ }
  const onData = () => {
    try {
      if (map.isStyleLoaded && map.isStyleLoaded()) { add(); map.off('styledata', onData); }
    } catch (e) { /* keep waiting */ }
  };
  map.on('styledata', onData);
  map.once('idle', () => { try { add(); map.off('styledata', onData); } catch (e) {} });
}

/* ============================================================================
   mountSidecar(bodyEl, opts) -> controller { setLang, destroy }
   ========================================================================== */
export default async function mountSidecar(bodyEl, opts = {}) {
  let lang = opts.lang === 'es' ? 'es' : 'en';

  // ---- structural DOM (built before async so a status panel can show) -----
  bodyEl.innerHTML = '';
  const scroll = document.createElement('div');
  scroll.className = 'nk-scroll';
  const graphic = document.createElement('div');
  graphic.className = 'nk-graphic';
  const mapEl = document.createElement('div');
  mapEl.className = 'nk-map';
  graphic.appendChild(mapEl);
  const status = document.createElement('div');
  status.className = 'nk-status';
  status.innerHTML = `<p data-nk-status>${lang === 'es' ? 'Cargando el mapa…' : 'Loading the map…'}</p>`;
  graphic.appendChild(status);
  scroll.appendChild(graphic);
  bodyEl.appendChild(scroll);

  let geojson, i18n, maplibregl, scrollamaFactory;

  // Graceful degradation: render the bilingual list of all parks (the map's
  // text equivalent) plus a short reason. Used whenever the interactive map
  // can't run — libraries blocked, OR no WebGL (e.g. a headless/GPU-less
  // browser, where new maplibregl.Map() throws "Failed to initialize WebGL").
  function failToList(err) {
    let dLang = lang;
    status.innerHTML = '';
    status.style.pointerEvents = 'auto';
    const errP = document.createElement('p');
    errP.className = 'nk-err';
    const detail = document.createElement('p');
    detail.style.cssText = 'font-size:.74rem;color:rgba(36,28,20,.55);margin:.3rem 0 0';
    detail.textContent = err && err.message ? `(${err.message})` : '';
    const list = document.createElement('ol');
    list.style.cssText = 'max-width:60ch;margin:1.2rem auto 0;text-align:left;padding-left:1.4rem';
    const render = () => {
      errP.textContent =
        dLang === 'es'
          ? 'No se pudo cargar el mapa interactivo. Aquí están los parques del Collar:'
          : 'The interactive map could not load. Here are the parks of the Necklace:';
      list.innerHTML = '';
      const pts = (geojson ? geojson.features : []).filter((f) => f.geometry.type === 'Point');
      pts.sort((a, b) => a.properties.order - b.properties.order);
      for (const f of pts) {
        const c = (i18n && i18n[f.properties.id] && i18n[f.properties.id][dLang]) || {};
        const li = document.createElement('li');
        li.innerHTML = '<strong></strong> <span></span>';
        li.querySelector('strong').textContent = c.heading || f.properties['name_' + dLang];
        li.querySelector('span').textContent = c.body || '';
        list.appendChild(li);
      }
    };
    render();
    status.appendChild(errP);
    status.appendChild(detail);
    status.appendChild(list);
    return {
      setLang: (l) => { dLang = l === 'es' ? 'es' : 'en'; render(); },
      destroy: () => { bodyEl.innerHTML = ''; },
    };
  }

  try {
    loadCss(VENDOR.mapCss);
    [geojson, i18n] = await Promise.all([loadJson(DATA.geojson), loadJson(DATA.i18n)]);
    await Promise.all([loadScript(VENDOR.mapJs), loadScript(VENDOR.scrollama)]);
    maplibregl = window.maplibregl;
    scrollamaFactory = window.scrollama;
    if (!maplibregl || !scrollamaFactory) throw new Error('Map libraries unavailable');
  } catch (err) {
    return failToList(err);
  }

  // ---- ordered bead list from the geojson ---------------------------------
  const beads = geojson.features
    .filter((f) => f.geometry.type === 'Point')
    .map((f) => ({
      id: f.properties.id,
      order: f.properties.order,
      pendant: !!f.properties.pendant,
      approx: !!f.properties.approx,
      center: f.geometry.coordinates,
      name_en: f.properties.name_en,
      name_es: f.properties.name_es,
    }))
    .sort((a, b) => a.order - b.order);

  const bounds = beads.reduce(
    (b, p) => [
      Math.min(b[0], p.center[0]), Math.min(b[1], p.center[1]),
      Math.max(b[2], p.center[0]), Math.max(b[3], p.center[1]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );

  // ---- map -----------------------------------------------------------------
  const styleValue = baseStyle(geojson);
  // URL-based styles (vector basemaps) don't include our river/bead layers, so
  // we graft them on after the style loads.
  const styleIsUrl = typeof styleValue === 'string';
  let map;
  try {
    map = new maplibregl.Map({
      container: mapEl,
      style: styleValue,
      bounds: [bounds[0], bounds[1], bounds[2], bounds[3]],
      fitBoundsOptions: { padding: 70, bearing: CAMERA.bearing },
      bearing: CAMERA.bearing, // south-up to match the compact map
      cooperativeGestures: true, // hard requirement: never trap page/overlay scroll
      attributionControl: { compact: true },
      dragRotate: true,
      maxZoom: 17,
      minZoom: 8,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-left');
  } catch (err) {
    // Most common cause: WebGL2 unavailable (headless / GPU-less browser).
    return failToList(err);
  }

  // active-bead label as an HTML marker (avoids needing a glyphs/font endpoint)
  const labelEl = document.createElement('div');
  labelEl.className = 'nk-bead-label';
  labelEl.style.cssText =
    'background:rgba(36,28,20,.88);color:#F6F1E8;font:600 12px/1.2 Karla,Arial,sans-serif;' +
    'padding:.3rem .55rem;border-radius:7px;white-space:nowrap;' +
    'box-shadow:0 2px 8px rgba(20,8,0,.35);pointer-events:none';
  // offset lifts the label above the bead dot (Marker controls the transform).
  const labelMarker = new maplibregl.Marker({ element: labelEl, anchor: 'bottom', offset: [0, -12] });

  // Proceed once the STYLE is ready (sources/layers registered) — do NOT block
  // the cards/scroll on remote basemap tiles, which may be slow or unavailable.
  // flyTo + feature-state only need the style loaded; tiles stream in after.
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const ok = () => { if (!settled) { settled = true; resolve(); } };
      const tryStyle = () => { if (map.isStyleLoaded && map.isStyleLoaded()) ok(); };
      if (map.isStyleLoaded && map.isStyleLoaded()) return ok();
      map.on('load', ok);
      map.on('styledata', tryStyle);
      map.once('error', (e) => {
        // A hard WebGL/context loss is fatal; tile/style fetch errors are not.
        if (!settled && e && e.error && /webgl|context/i.test(e.error.message || '')) {
          settled = true;
          reject(e.error);
        }
      });
      // Last resort: proceed anyway so the experience never hangs on tiles.
      setTimeout(ok, 6000);
    });
  } catch (err) {
    try { map.remove(); } catch (e) {}
    return failToList(err);
  }
  if (styleIsUrl) addNecklaceLayers(map, geojson);
  status.remove();

  // One-time cooperative-gesture hint (MapLibre's repeating hint is hidden in
  // CSS). Shown once per browser session, then auto-dismissed.
  showCoopHintOnce();

  // ---- step cards + chrome -------------------------------------------------
  const steps = document.createElement('div');
  steps.className = 'nk-steps';
  const leadSpacer = document.createElement('div');
  leadSpacer.className = 'nk-spacer';
  steps.appendChild(leadSpacer);

  const stepEls = beads.map((b) => {
    const step = document.createElement('section');
    step.className = 'nk-step';
    step.dataset.beadId = b.id;
    step.dataset.index = String(b.order - 1);
    const card = document.createElement('div');
    card.className = 'nk-card' + (b.pendant ? ' is-pendant' : '');
    card.innerHTML = `
      <span class="nk-region"></span>
      <span class="nk-num"></span>
      <h3></h3>
      <p></p>
      <span class="nk-approx" hidden></span>`;
    step.appendChild(card);
    steps.appendChild(step);
    return step;
  });
  const tailSpacer = document.createElement('div');
  tailSpacer.className = 'nk-spacer';
  steps.appendChild(tailSpacer);
  scroll.appendChild(steps);

  // Give the pinned graphic an explicit pixel height (CSS height:100% resolves
  // to 0 against a flex parent with an "indefinite" height), and pull the steps
  // up to overlap it by exactly the scroll viewport height so the map stays
  // pinned for the whole scroll.
  function syncLayout() {
    const h = scroll.clientHeight;
    graphic.style.height = `${h}px`;
    steps.style.marginTop = `-${h}px`;
    leadSpacer.style.minHeight = `${Math.round(h * 0.3)}px`;
    tailSpacer.style.minHeight = `${Math.round(h * 0.3)}px`;
  }
  syncLayout();

  // ---- activation logic ----------------------------------------------------
  let activeIndex = -1;

  // UI string table (declared before buildChrome, which calls applyLang()).
  const T = {
    prev: { en: '‹ Previous', es: '‹ Anterior' },
    next: { en: 'Next ›', es: 'Siguiente ›' },
    atSummary: { en: `List all ${beads.length} parks`, es: `Ver los ${beads.length} parques` },
    region: { en: 'Bead', es: 'Cuenta' },
    pendant: { en: 'The Pendant', es: 'El Pendiente' },
    approx: { en: 'Approximate — to be confirmed', es: 'Aproximada — por confirmar' },
  };

  buildChrome();

  // ---- live region (announces active bead to screen readers) --------------
  const live = bodyEl.querySelector('[data-nk-live]');
  function setFeatureActive(idx, on) {
    if (idx < 0 || idx >= beads.length) return;
    // The 'necklace' source may be grafted on slightly after a URL basemap
    // loads; ignore until it exists.
    try {
      if (!map.getSource('necklace')) return;
      map.setFeatureState({ source: 'necklace', id: beads[idx].id }, { active: on });
    } catch (e) { /* source not ready yet */ }
  }
  function activate(idx, { fly = true } = {}) {
    if (idx === activeIndex || idx < 0 || idx >= beads.length) return;
    if (activeIndex >= 0) setFeatureActive(activeIndex, false);
    activeIndex = idx;
    setFeatureActive(idx, true);
    const b = beads[idx];

    map.stop(); // guard the queued-zoom bug under rapid stepping
    const cam = { center: b.center, zoom: CAMERA.zoom, bearing: CAMERA.bearing, pitch: CAMERA.pitch };
    if (fly && !prefersReducedMotion()) map.flyTo({ ...cam, duration: CAMERA.flyDuration, essential: true });
    else map.jumpTo(cam);

    labelMarker.setLngLat(b.center).addTo(map);
    labelEl.textContent = b['name_' + lang];

    stepEls.forEach((el, i) => el.classList.toggle('is-active', i === idx));
    updateChrome();
    if (live) live.textContent = `${b.order}. ${b['name_' + lang]}`;
  }

  // ---- Scrollama -----------------------------------------------------------
  const scroller = scrollamaFactory();
  scroller
    .setup({ step: stepEls, offset: 0.55 })
    .onStepEnter(({ index }) => activate(index));
  // Recompute on overlay resize.
  const onResize = () => { syncLayout(); scroller.resize(); map.resize(); };
  window.addEventListener('resize', onResize);

  // Map opens at the corridor overview (fitBounds), then flies to the start
  // bead (bead 1 from the CTA, or the bead the reader tapped in the compact map).
  // Default open lands on the pendant (Sun Valley); a tapped bead overrides it.
  const pendantIndex = beads.findIndex((b) => b.pendant);
  const startIndex = opts.startIndex != null
    ? Math.max(0, Math.min(beads.length - 1, Number(opts.startIndex) || 0))
    : (pendantIndex >= 0 ? pendantIndex : 0);
  if (startIndex > 0) stepEls[startIndex].scrollIntoView({ block: 'center' });
  activate(startIndex);
  // With a URL basemap the necklace source attaches a beat later; re-assert the
  // active bead's highlight once the map settles.
  map.once('idle', () => setFeatureActive(activeIndex, true));
  // Re-sync once layout/tiles settle (catches late overlay sizing).
  requestAnimationFrame(() => { syncLayout(); scroller.resize(); map.resize(); });

  // ---- chrome (controls + accessible list); rebuilt-safe -------------------
  function buildChrome() {
    // controls
    let controls = bodyEl.querySelector('.nk-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'nk-controls';
      controls.innerHTML = `
        <button class="nk-btn" data-nk-prev type="button"></button>
        <span class="nk-counter" data-nk-counter></span>
        <div class="nk-progress" aria-hidden="true"><i data-nk-bar></i></div>
        <button class="nk-btn" data-nk-next type="button"></button>
        <span class="nk-sr" role="status" aria-live="polite" data-nk-live></span>`;
      bodyEl.appendChild(controls);
      controls.querySelector('[data-nk-prev]').addEventListener('click', () => go(-1));
      controls.querySelector('[data-nk-next]').addEventListener('click', () => go(1));
    }
    // accessible text-equivalent list of all parks
    if (!bodyEl.querySelector('.nk-at')) {
      const at = document.createElement('details');
      at.className = 'nk-at';
      at.innerHTML = `<summary data-nk-at-summary></summary><ol data-nk-at-list></ol>`;
      bodyEl.appendChild(at);
    }
    applyLang();
  }

  function go(delta) {
    const next = Math.max(0, Math.min(beads.length - 1, activeIndex + delta));
    if (next === activeIndex) return;
    const reduce = prefersReducedMotion();
    stepEls[next].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    activate(next); // immediate (keyboard) — idempotent with the IO callback
  }

  function updateChrome() {
    const prev = bodyEl.querySelector('[data-nk-prev]');
    const next = bodyEl.querySelector('[data-nk-next]');
    const counter = bodyEl.querySelector('[data-nk-counter]');
    const bar = bodyEl.querySelector('[data-nk-bar]');
    if (prev) prev.disabled = activeIndex <= 0;
    if (next) next.disabled = activeIndex >= beads.length - 1;
    if (counter) counter.textContent = `${Math.max(activeIndex + 1, 1)} / ${beads.length}`;
    if (bar) bar.style.width = `${((activeIndex + 1) / beads.length) * 100}%`;
  }

  // ---- i18n ----------------------------------------------------------------
  function applyLang() {
    // cards
    stepEls.forEach((step) => {
      const b = beads.find((x) => x.id === step.dataset.beadId);
      const copy = (i18n[b.id] && i18n[b.id][lang]) || {};
      step.querySelector('.nk-num').textContent = b.pendant ? T.pendant[lang] : `${T.region[lang]} ${b.order} / ${beads.length}`;
      step.querySelector('.nk-region').textContent = '';
      step.querySelector('h3').textContent = copy.heading || b['name_' + lang];
      step.querySelector('p').textContent = copy.body || '';
      const ap = step.querySelector('.nk-approx');
      ap.hidden = !b.approx;
      ap.textContent = T.approx[lang];
    });
    // controls
    const prev = bodyEl.querySelector('[data-nk-prev]');
    const next = bodyEl.querySelector('[data-nk-next]');
    if (prev) prev.textContent = T.prev[lang];
    if (next) next.textContent = T.next[lang];
    // accessible list
    const summary = bodyEl.querySelector('[data-nk-at-summary]');
    const list = bodyEl.querySelector('[data-nk-at-list]');
    if (summary) summary.textContent = T.atSummary[lang];
    if (list) {
      list.innerHTML = '';
      beads.forEach((b) => {
        const copy = (i18n[b.id] && i18n[b.id][lang]) || {};
        const li = document.createElement('li');
        li.innerHTML = `<strong></strong> <span></span>`;
        li.querySelector('strong').textContent = copy.heading || b['name_' + lang];
        li.querySelector('span').textContent = copy.body || '';
        list.appendChild(li);
      });
    }
    // active label marker text
    if (activeIndex >= 0 && typeof labelEl !== 'undefined') {
      labelEl.textContent = beads[activeIndex]['name_' + lang];
    }
    updateChrome();
  }

  function setLang(l) {
    lang = l === 'es' ? 'es' : 'en';
    applyLang();
  }

  function showCoopHintOnce() {
    let seen = false;
    try { seen = sessionStorage.getItem('nkCoopHintSeen') === '1'; } catch (e) {}
    if (seen) return;
    const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
    const key = mac ? '⌘' : 'Ctrl';
    const hint = document.createElement('div');
    hint.className = 'nk-coop-hint';
    hint.textContent = lang === 'es'
      ? `Usa ${key} + desplazar para acercar el mapa`
      : `Use ${key} + scroll to zoom the map`;
    graphic.appendChild(hint);
    requestAnimationFrame(() => hint.classList.add('is-on'));
    setTimeout(() => {
      hint.classList.remove('is-on');
      setTimeout(() => hint.remove(), 450);
    }, 4500);
    try { sessionStorage.setItem('nkCoopHintSeen', '1'); } catch (e) {}
  }

  function destroy() {
    try { window.removeEventListener('resize', onResize); } catch (e) {}
    try { scroller.destroy(); } catch (e) {}
    try { map.remove(); } catch (e) {}
    bodyEl.innerHTML = '';
  }

  return { setLang, destroy };
}
