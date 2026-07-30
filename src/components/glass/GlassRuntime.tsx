'use client';

import { useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const STORE_KEY = 'arduino888-theme';

type GlassTheme = 'light' | 'dark';

declare global {
  interface Window {
    Glass?: {
      applyLens: (force?: boolean) => void;
      setTheme: (theme: GlassTheme) => void;
      currentTheme: () => GlassTheme;
    };
  }
}

function currentTheme(): GlassTheme {
  if (typeof window === 'undefined') return 'light';

  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark' || explicit === 'light') return explicit;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ensureDefs(): SVGSVGElement {
  let svg = document.getElementById('g-defs') as SVGSVGElement | null;
  if (svg) return svg;

  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'g-defs';
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.width = '0';
  svg.style.height = '0';
  svg.style.overflow = 'hidden';
  document.body.appendChild(svg);
  return svg;
}

function buildMap(width: number, height: number, theme: GlassTheme): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const image = ctx.createImageData(width, height);
  const data = image.data;
  const maxDim = Math.max(width, height);
  const amp = theme === 'dark' ? 17 : 13;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const edge = Math.min(nx, ny, 1 - nx, 1 - ny);
      const edgePull = Math.pow(Math.max(0, 1 - edge * 7), 2);
      const wave = Math.sin((x + y) / maxDim * Math.PI * 5.2) * 0.35 + Math.cos(y / maxDim * Math.PI * 4.6) * 0.3;
      const center = Math.sin(nx * Math.PI) * Math.sin(ny * Math.PI);
      const r = 128 + (edgePull * amp) + (wave * amp * 0.38);
      const g = 128 + (center * amp * 0.7) - (edgePull * amp * 0.32);
      data[i] = Math.max(0, Math.min(255, Math.round(r)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

function applyLens(force = false): void {
  if (typeof document === 'undefined') return;

  const bars = Array.from(document.querySelectorAll<HTMLElement>('.g-bar'));
  if (!bars.length) return;

  const svg = ensureDefs();
  const theme = currentTheme();

  bars.forEach((bar, index) => {
    const width = Math.round(bar.offsetWidth);
    const height = Math.round(bar.offsetHeight);
    if (!width || !height) return;

    const sig = `${width}x${height}:${theme}`;
    if (!force && bar.dataset.lensSig === sig) return;

    const id = `g-lens-${index + 1}`;
    const dataUrl = buildMap(width, height, theme);
    if (!dataUrl) return;

    let filter = document.getElementById(id) as SVGFilterElement | null;
    if (!filter) {
      filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      filter.id = id;
      svg.appendChild(filter);
    }

    filter.setAttribute('x', '0%');
    filter.setAttribute('y', '0%');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.innerHTML = `
      <feImage href="${dataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="map" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale="${theme === 'dark' ? 18 : 14}" xChannelSelector="R" yChannelSelector="G" />
    `;

    bar.style.backdropFilter = `saturate(1.7) blur(7px) url(#${id})`;
    bar.style.setProperty('-webkit-backdrop-filter', `saturate(1.7) blur(7px) url(#${id})`);
    bar.dataset.lensSig = sig;
  });
}

function setTheme(theme: GlassTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.localStorage.setItem(STORE_KEY, theme);
  } catch {
    // Storage can be unavailable in private or embedded browser contexts.
  }
  window.dispatchEvent(new CustomEvent('glass:themechange', { detail: { theme } }));
  window.requestAnimationFrame(() => applyLens(true));
}

export default function GlassRuntime() {
  const pathname = usePathname();

  const refreshLens = useCallback((force = false) => {
    window.requestAnimationFrame(() => applyLens(force));
  }, []);

  useEffect(() => {
    window.Glass = { applyLens, setTheme, currentTheme };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('.g-theme') : null;
      if (!target) return;
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    };

    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refreshLens(true), 120);
    };
    const onThemeChange = () => refreshLens(true);

    const observer = new MutationObserver(() => refreshLens(true));
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemTheme = () => refreshLens(true);

    document.addEventListener('click', onClick);
    window.addEventListener('resize', onResize);
    window.addEventListener('glass:themechange', onThemeChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    media.addEventListener('change', onSystemTheme);
    refreshLens(true);

    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('glass:themechange', onThemeChange);
      observer.disconnect();
      media.removeEventListener('change', onSystemTheme);
      window.clearTimeout(timer);
      delete window.Glass;
    };
  }, [refreshLens]);

  useEffect(() => {
    refreshLens(true);
  }, [pathname, refreshLens]);

  return null;
}
