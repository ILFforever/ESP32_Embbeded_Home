'use client';

import { useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getCurrentTheme, setTheme, toggleTheme, type GlassTheme } from './theme';

/**
 * Shared Glass behaviour, mounted once from the root layout.
 *
 *   1. The lens — real refraction on the sticky toolbar
 *   2. Toggle switches
 *   3. Single-choice groups
 *   4. Modals
 *   5. Live slider labels
 *   6. Theme toggle
 *
 * All of it is delegated off document, so components stay plain markup
 * and nothing needs wiring per page.
 */

declare global {
  interface Window {
    Glass?: {
      applyLens: (force?: boolean) => void;
      setTheme: (theme: GlassTheme) => void;
      currentTheme: () => GlassTheme;
      openModal: (id: string) => void;
    };
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ---------- 1. THE LENS -------------------------------------------
   A rounded-rect signed distance field is rasterised into a
   displacement map: red carries X displacement, green carries Y, both
   measured outward from the nearest edge and falling off to nothing a
   short way in. feDisplacementMap then bends the real backdrop through
   it, so content scrolling behind the toolbar visibly distorts at the
   rim. Three passes at slightly different scales, recombined per
   colour channel, give the chromatic fringe glass has.

   This must stay an SDF. A wave function plus a rectangular edge
   distance distorts the whole surface instead of just the rim, and
   ignores the pill's corner radius entirely.

   Applied to .g-bar ONLY. Measured on a 12-pane dashboard: lens on
   every pane gave 14.1ms mean / 38.2ms p95 scroll frames; toolbar
   alone gave 6.1 / 6.4. Cards sit on wallpaper with nothing behind
   them to refract, so they pay full cost and show none of it.
------------------------------------------------------------------- */
function lensSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    (CSS.supports('backdrop-filter', 'url(#a)') ||
      CSS.supports('-webkit-backdrop-filter', 'url(#a)'))
  );
}

function buildDisplacementMap(w: number, h: number, radius: number, band: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(w, h);
  const d = img.data;
  const hw = w / 2;
  const hh = h / 2;
  const r = Math.min(radius, hw, hh);

  // signed distance to a rounded rect; negative inside
  const sd = (x: number, y: number): number => {
    const qx = Math.abs(x) - hw + r;
    const qy = Math.abs(y) - hh + r;
    const ax = qx > 0 ? qx : 0;
    const ay = qy > 0 ? qy : 0;
    const inner = Math.max(qx, qy);
    return Math.sqrt(ax * ax + ay * ay) + (inner < 0 ? inner : 0) - r;
  };

  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const x = px - hw + 0.5;
      const y = py - hh + 0.5;
      const dist = sd(x, y);
      const i = (py * w + px) * 4;
      d[i + 2] = 128;
      d[i + 3] = 255;

      const t = dist > 0 ? 0 : 1 + dist / band; // 1 at the rim, 0 band px in
      if (t <= 0) {
        d[i] = 128;
        d[i + 1] = 128;
        continue;
      }

      let nx = sd(x + 1, y) - sd(x - 1, y); // outward normal
      let ny = sd(x, y + 1) - sd(x, y - 1);
      const len = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= len;
      ny /= len;

      const m = Math.pow(t, 2.2); // thin centre, thick rim
      d[i] = Math.max(0, Math.min(255, Math.round(128 + nx * 127 * m)));
      d[i + 1] = Math.max(0, Math.min(255, Math.round(128 + ny * 127 * m)));
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

function el(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function ensureDefs(): SVGDefsElement {
  let svg = document.getElementById('g-defs') as SVGSVGElement | null;
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.id = 'g-defs';
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.appendChild(document.createElementNS(SVG_NS, 'defs'));
    document.body.appendChild(svg);
  }
  return svg.querySelector('defs') as SVGDefsElement;
}

let lensSeq = 0;

function applyLens(force = false): void {
  if (typeof document === 'undefined' || !lensSupported()) return;

  const bars = Array.from(document.querySelectorAll<HTMLElement>('.g-bar'));
  if (!bars.length) return;

  const defs = ensureDefs();
  const theme = getCurrentTheme();

  bars.forEach((bar) => {
    const w = Math.round(bar.offsetWidth);
    const h = Math.round(bar.offsetHeight);
    if (!w || !h) return; // hidden — nothing to measure

    const sig = `${w}x${h}:${theme}`;
    if (!force && bar.dataset.lensSig === sig) return;

    const radius = parseFloat(getComputedStyle(bar).borderTopLeftRadius) || 26;
    const band = Math.min(30, Math.max(12, Math.min(w, h) * 0.32));
    const href = buildDisplacementMap(w, h, radius, band);
    if (!href) return;

    if (bar.dataset.lensId) {
      document.getElementById(bar.dataset.lensId)?.remove();
    }
    const id = `g-lens-${(lensSeq += 1)}`;

    const filter = el('filter', {
      id,
      filterUnits: 'objectBoundingBox',
      primitiveUnits: 'userSpaceOnUse',
      x: '0%',
      y: '0%',
      width: '100%',
      height: '100%',
      'color-interpolation-filters': 'sRGB',
    });

    filter.appendChild(
      el('feImage', {
        result: 'map',
        x: 0,
        y: 0,
        width: w,
        height: h,
        preserveAspectRatio: 'none',
        href,
      }),
    );

    // one pass per channel — the scale spread is the chromatic fringe
    ([['R', 30], ['G', 34], ['B', 38]] as const).forEach(([ch, scale]) => {
      filter.appendChild(
        el('feDisplacementMap', {
          in: 'SourceGraphic',
          in2: 'map',
          scale,
          xChannelSelector: 'R',
          yChannelSelector: 'G',
          result: `p${ch}`,
        }),
      );
    });
    filter.appendChild(
      el('feColorMatrix', {
        in: 'pR', type: 'matrix', result: 'cR',
        values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
      }),
    );
    filter.appendChild(
      el('feColorMatrix', {
        in: 'pG', type: 'matrix', result: 'cG',
        values: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
      }),
    );
    filter.appendChild(
      el('feColorMatrix', {
        in: 'pB', type: 'matrix', result: 'cB',
        values: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
      }),
    );
    filter.appendChild(
      el('feComposite', {
        in: 'cR', in2: 'cG', operator: 'arithmetic',
        k1: 0, k2: 1, k3: 1, k4: 0, result: 'rg',
      }),
    );
    filter.appendChild(
      el('feComposite', {
        in: 'rg', in2: 'cB', operator: 'arithmetic',
        k1: 0, k2: 1, k3: 1, k4: 0,
      }),
    );

    defs.appendChild(filter);
    bar.dataset.lensId = id;
    bar.dataset.lensSig = sig;

    // Far less blur than frosted glass: this distorts rather than obscures.
    const value = `saturate(1.7) blur(7px) url(#${id})`;
    bar.style.backdropFilter = value;
    bar.style.setProperty('-webkit-backdrop-filter', value);
  });
}

/* ---------- 5. SLIDERS -------------------------------------------- */
/* backgroundImage, not the background shorthand — the shorthand resets
   the background-size that keeps the visible track 5px inside a 24px
   grabbable element. See the .g-slider note in globals.css. */
function paintSlider(s: HTMLInputElement): void {
  const min = Number(s.min || 0);
  const max = Number(s.max || 100);
  const pct = ((Number(s.value) - min) / (max - min || 1)) * 100;
  s.style.backgroundImage =
    `linear-gradient(to right, var(--accent) 0 ${pct}%, var(--sunken) ${pct}% 100%)`;
  if (s.dataset.output) {
    const out = document.getElementById(s.dataset.output);
    if (out) out.textContent = s.value;
  }
}

export default function GlassRuntime() {
  const pathname = usePathname();

  const refreshLens = useCallback((force = false) => {
    window.requestAnimationFrame(() => applyLens(force));
  }, []);

  useEffect(() => {
    let lastFocus: HTMLElement | null = null;

    const openModal = (id: string) => {
      const m = document.getElementById(id);
      if (!m) return;
      lastFocus = document.activeElement as HTMLElement;
      m.hidden = false;
      m.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]')?.focus();
    };
    const closeModal = (m: HTMLElement | null) => {
      if (!m) return;
      m.hidden = true;
      lastFocus?.focus?.();
    };

    window.Glass = { applyLens, setTheme, currentTheme: getCurrentTheme, openModal };

    const onClick = (event: MouseEvent) => {
      const t = event.target;
      if (!(t instanceof Element)) return;

      if (t.closest('.g-theme')) { toggleTheme(); return; }

      // 2. toggle switches
      const sw = t.closest<HTMLButtonElement>('.g-switch');
      if (sw && !sw.disabled) {
        const on = sw.getAttribute('aria-pressed') === 'true';
        sw.setAttribute('aria-pressed', String(!on));
        sw.dispatchEvent(new CustomEvent('g:toggle', { bubbles: true, detail: { on: !on } }));
        return;
      }

      // 3. single-choice groups
      const choice = t.closest('[data-choice] button, [data-choice] a');
      if (choice) {
        choice.closest('[data-choice]')
          ?.querySelectorAll('button, a')
          .forEach((o) => o.removeAttribute('aria-current'));
        choice.setAttribute('aria-current', 'true');
        return;
      }

      // 4. modals
      const opener = t.closest<HTMLElement>('[data-open]');
      if (opener?.dataset.open) { openModal(opener.dataset.open); return; }

      const closer = t.closest('[data-close]');
      if (closer) { closeModal(closer.closest<HTMLElement>('.g-modal')); return; }

      if (t.classList.contains('g-modal')) closeModal(t as HTMLElement);
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      closeModal(document.querySelector<HTMLElement>('.g-modal:not([hidden])'));
    };

    const onInput = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.classList.contains('g-slider')) paintSlider(t);
    };

    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refreshLens(true), 120);
    };
    const onThemeChange = () => refreshLens(true);
    const observer = new MutationObserver(() => refreshLens(true));
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('input', onInput);
    window.addEventListener('resize', onResize);
    window.addEventListener('glass:themechange', onThemeChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    media.addEventListener('change', onThemeChange);

    document.querySelectorAll<HTMLInputElement>('.g-slider').forEach(paintSlider);
    refreshLens(true);

    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('input', onInput);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('glass:themechange', onThemeChange);
      observer.disconnect();
      media.removeEventListener('change', onThemeChange);
      window.clearTimeout(timer);
      delete window.Glass;
    };
  }, [refreshLens]);

  // Route changes re-render the toolbar; the map must be rebuilt for it.
  useEffect(() => {
    refreshLens(true);
    document.querySelectorAll<HTMLInputElement>('.g-slider').forEach(paintSlider);
  }, [pathname, refreshLens]);

  return null;
}
