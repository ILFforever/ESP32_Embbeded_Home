/**
 * Single source of truth for theme state.
 *
 * This existed in three places after the first pass — GlassRuntime plus
 * copy-pasted blocks in Login and the dashboard page. Three copies of a
 * storage key is how a theme toggle silently stops persisting on one
 * page. Import from here; do not redeclare.
 *
 * The pre-paint <script> in app/layout.tsx must keep using this same
 * key literal, because it runs before any module is evaluated.
 */
export const THEME_STORE_KEY = 'arduino888-theme';

export type GlassTheme = 'light' | 'dark';

/** What the page is showing right now: explicit override, else the OS. */
export function getCurrentTheme(): GlassTheme {
  if (typeof document === 'undefined') return 'light';

  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark' || explicit === 'light') return explicit;

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** True when ?theme= pinned the page — pinned pages must not persist. */
export function isPinned(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('theme');
    return q === 'dark' || q === 'light';
  } catch {
    return false;
  }
}

/**
 * Stamp the theme, persist it, and tell the runtime to rebuild the lens —
 * the displacement map is generated against the current backdrop, so a
 * stale one refracts the wrong thing.
 */
export function setTheme(next: GlassTheme): void {
  document.documentElement.setAttribute('data-theme', next);

  if (!isPinned()) {
    try {
      window.localStorage.setItem(THEME_STORE_KEY, next);
    } catch {
      // Storage is unavailable in private / embedded contexts. Not fatal.
    }
  }

  window.dispatchEvent(new CustomEvent('glass:themechange', { detail: { theme: next } }));
}

export function toggleTheme(): GlassTheme {
  const next: GlassTheme = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
