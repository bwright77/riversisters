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
   'canvas'  : tokenless solid background + our own river/bead layers. No tiles,
               no API key, works offline, fully bilingual labels. Ships today.
   'maptiler': quick street-context prototype (free tier; needs a key; English-
               only place labels — flag the tradeoff per the brief §6).
   'protomaps': production path — a self-hosted Denver .pmtiles extract. Left as
               a documented TODO: it needs the pmtiles protocol lib vendored and
               a hosted extract, which is Benjamin's hosting decision (§13).
   --------------------------------------------------------------------------- */
const BASEMAP = {
  mode: 'canvas',
  maptilerKey: '',
  protomapsUrl: '/basemap/denver.pmtiles',
};

const CAMERA = { zoom: 14.3, bearing: 0, pitch: 0, flyDuration: 1200 };

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

/* ---- canvas (tokenless) style -------------------------------------------- */
function canvasStyle(geojson) {
  return {
    version: 8,
    name: 'necklace-canvas',
    sources: { necklace: { type: 'geojson', data: geojson, promoteId: 'id' } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': C.bone } },
      {
        id: 'creek',
        type: 'line',
        source: 'necklace',
        filter: ['==', ['get', 'kind'], 'creek'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#8FD6D4', 'line-width': 2, 'line-opacity': 0.8 },
      },
      {
        id: 'river',
        type: 'line',
        source: 'necklace',
        filter: ['==', ['get', 'kind'], 'river'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.turquoise,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 14, 5, 16, 7],
        },
      },
      {
        id: 'bead-halo',
        type: 'circle',
        source: 'necklace',
        filter: ['has', 'order'],
        paint: {
          'circle-radius': ['case', ['boolean', ['feature-state', 'active'], false], 16, 0],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
          'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'active'], false], 0.95, 0],
        },
      },
      {
        id: 'beads',
        type: 'circle',
        source: 'necklace',
        filter: ['has', 'order'],
        paint: {
          'circle-radius': ['case', ['boolean', ['feature-state', 'active'], false], 9, 5.5],
          'circle-color': ['case', ['get', 'seven'], C.clay, C.turquoise],
          'circle-stroke-color': C.bone,
          'circle-stroke-width': 1.8,
          'circle-opacity': ['case', ['boolean', ['feature-state', 'active'], false], 1, 0.55],
        },
      },
    ],
  };
}

/* MapTiler prototype: load their style, then graft our necklace layers on top. */
function maptilerStyleUrl() {
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${BASEMAP.maptilerKey}`;
}
function addNecklaceLayers(map, geojson) {
  if (!map.getSource('necklace')) {
    map.addSource('necklace', { type: 'geojson', data: geojson, promoteId: 'id' });
  }
  const s = canvasStyle(geojson).layers.filter((l) => l.id !== 'bg');
  for (const l of s) if (!map.getLayer(l.id)) map.addLayer(l);
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

  // Graceful degradation: render the bilingual list of all 16 parks (the map's
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
          ? 'No se pudo cargar el mapa interactivo. Aquí están los 16 parques del Collar:'
          : 'The interactive map could not load. Here are the 16 parks of the Necklace:';
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
      seven: !!f.properties.seven,
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
  const useMaptiler = BASEMAP.mode === 'maptiler' && BASEMAP.maptilerKey;
  let map;
  try {
    map = new maplibregl.Map({
      container: mapEl,
      style: useMaptiler ? maptilerStyleUrl() : canvasStyle(geojson),
      bounds: [bounds[0], bounds[1], bounds[2], bounds[3]],
      fitBoundsOptions: { padding: 60 },
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

  // Wait for first load; don't hang forever if the style/context never settles.
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const ok = () => { if (!settled) { settled = true; resolve(); } };
      map.on('load', ok);
      map.once('error', (e) => {
        // Non-fatal style/tile errors keep waiting; a hard context loss rejects.
        if (!settled && e && e.error && /webgl|context/i.test(e.error.message || '')) {
          settled = true;
          reject(e.error);
        }
      });
      setTimeout(() => { if (!settled) { settled = true; reject(new Error('Map load timed out')); } }, 12000);
    });
  } catch (err) {
    try { map.remove(); } catch (e) {}
    return failToList(err);
  }
  if (useMaptiler) addNecklaceLayers(map, geojson);
  status.remove();

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
    card.className = 'nk-card' + (b.seven ? ' is-seven' : '');
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
    atSummary: { en: 'List all 16 parks', es: 'Ver los 16 parques' },
    region: { en: 'Bead', es: 'Cuenta' },
    approx: { en: 'Approximate — to be confirmed', es: 'Aproximada — por confirmar' },
  };

  buildChrome();

  // ---- live region (announces active bead to screen readers) --------------
  const live = bodyEl.querySelector('[data-nk-live]');
  function setFeatureActive(idx, on) {
    if (idx < 0 || idx >= beads.length) return;
    map.setFeatureState({ source: 'necklace', id: beads[idx].id }, { active: on });
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

  // Map opens at the corridor overview (fitBounds), then flies to bead 1.
  activate(0);
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
    // accessible text-equivalent list of all 16 parks
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
      step.querySelector('.nk-num').textContent = `${T.region[lang]} ${b.order} / ${beads.length}`;
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

  function destroy() {
    try { window.removeEventListener('resize', onResize); } catch (e) {}
    try { scroller.destroy(); } catch (e) {}
    try { map.remove(); } catch (e) {}
    bodyEl.innerHTML = '';
  }

  return { setLang, destroy };
}
