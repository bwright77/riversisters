/* ============================================================================
   Turquoise Necklace — compact-view controller.
   Loaded on the page (tiny, no WebGL). Owns:
     - the "Explore the full Necklace" CTA wiring,
     - the full-screen modal overlay shell (role=dialog) and its a11y plumbing
       (focus trap, focus return, body-scroll lock, ESC),
     - lazy-loading the heavy MapLibre sidecar module ONLY on expand,
     - the #necklace-explore deep link.
   If the CTA isn't present the whole feature stays dormant (clean toggle-off).
   ========================================================================== */
const HASH = '#necklace-explore';

const cta = document.getElementById('nk-cta');
if (cta) init();

function currentLang() {
  return document.documentElement.lang === 'es' ? 'es' : 'en';
}

// Mirror the site's data-en/data-es swap for a freshly-built subtree.
function translateTree(root, l) {
  root.querySelectorAll('[data-en]').forEach((el) => {
    const v = el.getAttribute('data-' + l);
    if (v != null) el.textContent = v;
  });
  root.querySelectorAll('[data-' + l + '-label]').forEach((el) =>
    el.setAttribute('aria-label', el.getAttribute('data-' + l + '-label')),
  );
}

function init() {
  let overlay, body, sidecar, lastFocused, savedScrollY, isOpen = false;

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'nk-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'nk-overlay-title');
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="nk-topbar">
        <div class="nk-title-wrap">
          <p class="nk-eyebrow" data-en="Turquoise Necklace" data-es="Collar Turquesa">Turquoise Necklace</p>
          <h2 class="nk-title" id="nk-overlay-title"
              data-en="Scroll the corridor — twenty-three parks along the South Platte"
              data-es="Recorre el corredor — veintitrés parques del South Platte">Scroll the corridor — twenty-three parks along the South Platte</h2>
        </div>
        <div class="nk-lang" role="group" aria-label="Language / Idioma">
          <button type="button" data-nk-lang="en" lang="en">EN</button>
          <button type="button" data-nk-lang="es" lang="es">ES</button>
        </div>
        <button class="nk-close" type="button" data-nk-close
                data-en-label="Close the full Necklace view" data-es-label="Cerrar la vista del Collar completo"
                aria-label="Close the full Necklace view">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>
        </button>
      </div>
      <div class="nk-body" data-nk-body></div>`;
    document.body.appendChild(overlay);
    body = overlay.querySelector('[data-nk-body]');
    overlay.querySelector('[data-nk-close]').addEventListener('click', () => close('user'));
    // The page's own EN/ES toggle is hidden behind the overlay; proxy to it so
    // the site's real swap() runs (the lang MutationObserver relays to cards).
    overlay.querySelectorAll('[data-nk-lang]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-nk-lang') === 'es' ? 'btn-es' : 'btn-en';
        const pageBtn = document.getElementById(id);
        if (pageBtn) pageBtn.click();
      }),
    );
    overlay.addEventListener('keydown', onKeydown);
  }

  function syncLangButtons() {
    if (!overlay) return;
    const l = currentLang();
    overlay.querySelectorAll('[data-nk-lang]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.getAttribute('data-nk-lang') === l)),
    );
  }

  function focusables() {
    return Array.from(
      overlay.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close('user');
      return;
    }
    if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  async function open(source, opts = {}) {
    if (isOpen) return;
    isOpen = true;
    if (!overlay) buildOverlay();
    lastFocused = document.activeElement;
    savedScrollY = window.scrollY;

    // lock body scroll without losing position
    document.body.style.top = `-${savedScrollY}px`;
    document.body.classList.add('nk-locked');
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';

    translateTree(overlay, currentLang());
    syncLangButtons();
    overlay.hidden = false;
    // allow layout before transition
    requestAnimationFrame(() => overlay.classList.add('is-open'));

    if (source !== 'hash') {
      if (location.hash !== HASH) history.pushState(null, '', HASH);
    }

    // move focus into the dialog
    overlay.querySelector('[data-nk-close]').focus();

    try {
      const mod = await import('./necklace-sidecar.js');
      if (!isOpen) return; // closed before load finished
      sidecar = await mod.default(body, { lang: currentLang(), startIndex: opts.index });
    } catch (err) {
      const msg = currentLang() === 'es'
        ? 'No se pudo abrir la vista completa.'
        : 'The full view could not be opened.';
      const detail = err && err.message ? `<p style="font-size:.74rem;color:rgba(36,28,20,.55);margin:.3rem 0 0">(${err.message})</p>` : '';
      body.innerHTML = `<div class="nk-status"><p class="nk-err">${msg}</p>${detail}</div>`;
    }
  }

  function close(reason) {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('is-open');

    const finish = () => {
      overlay.hidden = true;
      if (sidecar && sidecar.destroy) { try { sidecar.destroy(); } catch (e) {} }
      sidecar = null;
    };
    // wait out the fade unless reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else setTimeout(finish, 260);

    // restore body scroll
    document.body.classList.remove('nk-locked');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, savedScrollY || 0);

    // clear the hash (without re-triggering open)
    if (location.hash === HASH) {
      if (reason === 'pop') {
        /* hash already changed by browser back */
      } else {
        history.pushState(null, '', location.pathname + location.search);
      }
    }

    // return focus to the trigger; fall back to the CTA (e.g. deep-link opens
    // where nothing meaningful was focused).
    if (lastFocused && lastFocused !== document.body && lastFocused.focus) lastFocused.focus();
    else cta.focus();
  }

  // ---- wiring --------------------------------------------------------------
  cta.addEventListener('click', () => open('cta'));

  // Let the compact necklace's beads open the full view on the chosen bead.
  window.nkOpen = (index) => {
    const i = Number.isFinite(index) ? index : undefined;
    open('bead', { index: i });
  };

  // language: notify the sidecar; overlay chrome is translated by the site swap,
  // but observe lang directly so we stay correct however it changes.
  const langObserver = new MutationObserver(() => {
    if (isOpen && sidecar && sidecar.setLang) sidecar.setLang(currentLang());
    if (isOpen && overlay) { translateTree(overlay, currentLang()); syncLangButtons(); }
  });
  langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  // deep link + browser back/forward
  window.addEventListener('hashchange', () => {
    if (location.hash === HASH && !isOpen) open('hash');
    else if (location.hash !== HASH && isOpen) close('pop');
  });

  // auto-open on first paint if deep-linked
  if (location.hash === HASH) {
    requestAnimationFrame(() => open('hash'));
  }
}
