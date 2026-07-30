/* ============================================================
   ARDUINO888 — "GLASS" SHARED BEHAVIOUR
   Include on every page: <script src="glass.js" defer></script>

   Provides
     0. Theme (light / dark / follow the OS)
     1. The lens — real refraction on the sticky toolbar
     2. Toggle switches
     3. Single-choice button groups
     4. Modal open/close
     5. Live slider labels

   All of it is progressive: with JS off, pages still render as
   static glass. Nothing here is required for layout.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 0. THEME ------------------------------------
     Default is to follow the OS, with no attribute on <html> at all.
     A click stamps data-theme, which the last two token blocks in
     glass.css use to beat the media query in either direction.

     Note the ordering constraint: the stored preference is applied by
     an inline snippet in <head> (see any page), BEFORE first paint.
     Doing it here would flash the wrong theme for a frame.
  --------------------------------------------------------- */
  var STORE = 'arduino888-theme';

  // ?theme=dark pins a page for review. A pinned page still toggles,
  // but never writes to storage — otherwise opening a comparison view
  // would silently rewrite the reader's own preference.
  var PINNED = (function () {
    try {
      var q = new URLSearchParams(location.search).get('theme');
      return (q === 'dark' || q === 'light') ? q : null;
    } catch (e) { return null; }
  })();

  function systemDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function currentTheme() {
    var set = document.documentElement.getAttribute('data-theme');
    return set || (systemDark() ? 'dark' : 'light');
  }
  function setTheme(next) {
    document.documentElement.setAttribute('data-theme', next);
    if (!PINNED) {
      try { localStorage.setItem(STORE, next); } catch (e) { /* private mode */ }
    }
    // The wallpaper and pane fills changed underneath the lens, so the
    // displacement map has to be regenerated against the new backdrop.
    requestAnimationFrame(function () { applyLens(true); });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.g-theme')) return;
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });

  // If the user has expressed no explicit preference, keep following
  // the OS when it changes mid-session.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (!document.documentElement.hasAttribute('data-theme')) {
        requestAnimationFrame(function () { applyLens(true); });
      }
    });
  }

  /* ---------- 1. THE LENS ----------------------------------
     A rounded-rect signed distance field is rasterised into a
     displacement map — red carries X displacement, green carries Y,
     measured outward from the nearest edge and falling off to nothing
     a short way in. feDisplacementMap then bends the real backdrop
     through it, so content scrolling behind the toolbar visibly
     distorts at the rim. Three passes at slightly different scales,
     recombined per channel, give the chromatic fringe glass has.

     Applied to .g-bar ONLY, and this is deliberate. Measured on a
     12-pane dashboard: lens on every pane gave 14.1ms mean / 38.2ms
     p95 scroll frames; lens on the toolbar alone gave 6.1ms / 6.4ms.
     Cards sit on wallpaper and have nothing behind them to refract,
     so they pay the full cost and show none of the benefit.

     backdrop-filter: url() is Chromium-only. Elsewhere the plain
     blur + saturate in glass.css stands — inert, but correct.
  --------------------------------------------------------- */
  var SVGNS = 'http://www.w3.org/2000/svg';
  var lensOK = window.CSS && CSS.supports &&
               (CSS.supports('backdrop-filter', 'url(#a)') ||
                CSS.supports('-webkit-backdrop-filter', 'url(#a)'));
  var lensSeq = 0;

  function svgEl(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function buildDisplacementMap(w, h, radius, band) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(w, h);
    var d = img.data;
    var hw = w / 2, hh = h / 2;
    var r = Math.min(radius, hw, hh);

    function sd(x, y) {                        // negative inside the shape
      var qx = Math.abs(x) - hw + r;
      var qy = Math.abs(y) - hh + r;
      var ax = qx > 0 ? qx : 0;
      var ay = qy > 0 ? qy : 0;
      var inner = Math.max(qx, qy);
      return Math.sqrt(ax * ax + ay * ay) + (inner < 0 ? inner : 0) - r;
    }

    for (var py = 0; py < h; py++) {
      for (var px = 0; px < w; px++) {
        var x = px - hw + 0.5, y = py - hh + 0.5;
        var dist = sd(x, y);
        var i = (py * w + px) * 4;
        d[i + 2] = 128; d[i + 3] = 255;

        var t = dist > 0 ? 0 : 1 + dist / band; // 1 at rim, 0 band px in
        if (t <= 0) { d[i] = 128; d[i + 1] = 128; continue; }

        var nx = sd(x + 1, y) - sd(x - 1, y);   // outward normal
        var ny = sd(x, y + 1) - sd(x, y - 1);
        var len = Math.sqrt(nx * nx + ny * ny) || 1;
        nx /= len; ny /= len;

        var m = Math.pow(t, 2.2);               // thin centre, thick rim
        d[i]     = Math.max(0, Math.min(255, Math.round(128 + nx * 127 * m)));
        d[i + 1] = Math.max(0, Math.min(255, Math.round(128 + ny * 127 * m)));
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function ensureDefs() {
    var svg = document.querySelector('svg.g-defs');
    if (!svg) {
      svg = svgEl('svg', { 'class': 'g-defs', 'aria-hidden': 'true', focusable: 'false' });
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      svg.appendChild(svgEl('defs', {}));
      document.body.appendChild(svg);
    }
    return svg.querySelector('defs');
  }

  function applyLens(force) {
    if (!lensOK) return;
    var bars = document.querySelectorAll('.g-bar');
    if (!bars.length) return;
    var defs = ensureDefs();

    Array.prototype.forEach.call(bars, function (bar) {
      var w = Math.round(bar.offsetWidth), h = Math.round(bar.offsetHeight);
      if (!w || !h) return;                          // hidden — nothing to measure
      if (!force && bar.dataset.lensW == w && bar.dataset.lensH == h) return;

      var radius = parseFloat(getComputedStyle(bar).borderTopLeftRadius) || 26;
      var band = Math.min(30, Math.max(12, Math.min(w, h) * 0.32));
      var href = buildDisplacementMap(w, h, radius, band);

      if (bar.dataset.lensId) {
        var old = document.getElementById(bar.dataset.lensId);
        if (old) old.remove();
      }
      var id = 'g-lens-' + (++lensSeq);
      var f = svgEl('filter', {
        id: id, filterUnits: 'objectBoundingBox', primitiveUnits: 'userSpaceOnUse',
        x: '0%', y: '0%', width: '100%', height: '100%',
        'color-interpolation-filters': 'sRGB'
      });
      f.appendChild(svgEl('feImage', {
        result: 'map', x: 0, y: 0, width: w, height: h,
        preserveAspectRatio: 'none', href: href
      }));
      [['R', 30], ['G', 34], ['B', 38]].forEach(function (p) {
        f.appendChild(svgEl('feDisplacementMap', {
          'in': 'SourceGraphic', in2: 'map', scale: p[1],
          xChannelSelector: 'R', yChannelSelector: 'G', result: 'p' + p[0]
        }));
      });
      f.appendChild(svgEl('feColorMatrix', { 'in': 'pR', type: 'matrix', result: 'cR',
        values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0' }));
      f.appendChild(svgEl('feColorMatrix', { 'in': 'pG', type: 'matrix', result: 'cG',
        values: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0' }));
      f.appendChild(svgEl('feColorMatrix', { 'in': 'pB', type: 'matrix', result: 'cB',
        values: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0' }));
      f.appendChild(svgEl('feComposite', { 'in': 'cR', in2: 'cG', operator: 'arithmetic',
        k1: 0, k2: 1, k3: 1, k4: 0, result: 'rg' }));
      f.appendChild(svgEl('feComposite', { 'in': 'rg', in2: 'cB', operator: 'arithmetic',
        k1: 0, k2: 1, k3: 1, k4: 0 }));

      defs.appendChild(f);
      bar.dataset.lensId = id;
      bar.dataset.lensW = w;
      bar.dataset.lensH = h;
      // Far less blur than frosted glass: this distorts rather than obscures.
      bar.style.backdropFilter = bar.style.webkitBackdropFilter =
        'saturate(1.7) blur(7px) url(#' + id + ')';
    });
  }

  var lensTimer;
  window.addEventListener('resize', function () {
    clearTimeout(lensTimer);
    lensTimer = setTimeout(applyLens, 180);
  });

  /* ---------- 2. TOGGLES --------------------------------- */
  document.addEventListener('click', function (e) {
    var sw = e.target.closest('.g-switch');
    if (!sw || sw.disabled) return;
    var on = sw.getAttribute('aria-pressed') === 'true';
    sw.setAttribute('aria-pressed', String(!on));
    sw.dispatchEvent(new CustomEvent('g:toggle', { bubbles: true, detail: { on: !on } }));
  });

  /* ---------- 3. SINGLE-CHOICE GROUPS -------------------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-choice] button, [data-choice] a');
    if (!btn) return;
    var group = btn.closest('[data-choice]');
    group.querySelectorAll('button, a').forEach(function (o) {
      o.removeAttribute('aria-current');
    });
    btn.setAttribute('aria-current', 'true');
  });

  /* ---------- 4. MODALS ---------------------------------- */
  /* Open:  <button data-open="modal-id">
     Close: <button data-close> anywhere inside, backdrop click, or Esc */
  var lastFocus = null;

  function openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    lastFocus = document.activeElement;
    m.hidden = false;
    var f = m.querySelector('input, button, select, textarea, [tabindex]');
    if (f) f.focus();
  }
  function closeModal(m) {
    if (!m) return;
    m.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-open]');
    if (opener) { openModal(opener.dataset.open); return; }

    var closer = e.target.closest('[data-close]');
    if (closer) { closeModal(closer.closest('.g-modal')); return; }

    if (e.target.classList && e.target.classList.contains('g-modal')) {
      closeModal(e.target);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelector('.g-modal:not([hidden])');
    if (open) closeModal(open);
  });

  /* ---------- 5. LIVE SLIDER LABELS ---------------------- */
  /* <input class="g-slider" data-output="volume-value"> pairs with
     <output id="volume-value">. Also paints the filled portion. */
  function paintSlider(s) {
    var pct = (s.value - s.min) / ((s.max || 100) - s.min) * 100;
    // backgroundImage, not background — the shorthand would reset the
    // background-size that keeps the visible track 5px inside a 24px
    // grabbable element. See the .g-slider note in glass.css.
    s.style.backgroundImage =
      'linear-gradient(to right, var(--accent) 0 ' + pct + '%, var(--sunken) ' + pct + '% 100%)';
    if (s.dataset.output) {
      var out = document.getElementById(s.dataset.output);
      if (out) out.textContent = s.value;
    }
  }
  document.addEventListener('input', function (e) {
    if (e.target.classList && e.target.classList.contains('g-slider')) paintSlider(e.target);
  });

  /* ---------- INIT --------------------------------------- */
  function init() {
    document.querySelectorAll('.g-slider').forEach(paintSlider);
    applyLens();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Glass = {
    applyLens: applyLens,
    openModal: openModal,
    setTheme: setTheme,
    currentTheme: currentTheme
  };
})();
