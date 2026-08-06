'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getCurrentTheme, type GlassTheme } from '@/components/glass/theme';

/**
 * The floating toolbar, in one place.
 *
 * It was copied into /dashboard and /plan, and adding /access and /admin
 * would have made four copies of the same brand, nav, theme button, sign
 * out button and status pill — four places to fix a nav item, and the two
 * existing copies had already drifted (Access and Admin were buttons on
 * one page and links on the other).
 *
 * Three parts, laid out on a grid so the nav sits in the true centre of
 * the bar rather than in the centre of whatever space the brand and the
 * buttons leave over. Grid areas also give the phone layout its two rows
 * without reordering flex children.
 *
 * This is the only element carrying the liquid-glass lens (ground rule 2):
 * it is the one thing that moves over the page content.
 */

export type BarSection = 'home' | 'plan' | 'access' | 'admin';

interface GlassBarProps {
  current: BarSection;
}

const NAV: { id: BarSection; label: string; href: string; adminOnly?: boolean }[] = [
  { id: 'home', label: 'Home', href: '/dashboard' },
  { id: 'plan', label: 'Plan', href: '/plan' },
  { id: 'access', label: 'Access', href: '/access' },
  { id: 'admin', label: 'Admin', href: '/admin', adminOnly: true },
];

export default function GlassBar({ current }: GlassBarProps) {
  const router = useRouter();
  const { logout, user } = useAuth();
  const [theme, setTheme] = useState<GlassTheme>('light');

  /* GlassRuntime owns the toggle: it has a document-level click handler for
     .g-theme, which also serves the plain buttons on /login, /hub and
     /doorbell. This button therefore carries no onClick of its own — it
     only mirrors the result, so aria-pressed and the sun/moon swap stay
     truthful.

     A React onClick here would fire *in addition* to the runtime's and
     cancel it out: the App Router hydrates the whole document, so React's
     delegated listener and the runtime's are both on `document`, and
     stopPropagation does not stop other listeners on the same node.

     Reading the theme after mount rather than during render: the pre-paint
     script in layout.tsx owns the attribute until then, so rendering from
     it would mismatch the server output. */
  useEffect(() => {
    setTheme(getCurrentTheme());

    const onChange = (event: Event) => {
      const next = (event as CustomEvent<{ theme: GlassTheme }>).detail?.theme;
      if (next) setTheme(next);
    };

    window.addEventListener('glass:themechange', onChange);
    return () => window.removeEventListener('glass:themechange', onChange);
  }, []);

  return (
    <div className="g-pane g-bar">
      <span className="g-bar__brand">Arduino888</span>

      <nav className="g-seg" data-choice aria-label="Sections">
        {NAV.filter(item => !item.adminOnly || user?.role === 'admin').map(item => (
          <a key={item.id} href={item.href} aria-current={current === item.id ? 'page' : undefined}>
            {item.label}
          </a>
        ))}
      </nav>

      <div className="g-bar__actions">
        <button
          type="button"
          className="g-icon-btn g-theme"
          aria-label="Switch between light and dark"
          title="Switch theme"
          aria-pressed={theme === 'dark'}
        >
          <svg className="g-theme__moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M21 13.3A8.5 8.5 0 1 1 10.7 3a6.7 6.7 0 0 0 10.3 10.3Z" />
          </svg>
          <svg className="g-theme__sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </button>

        {/* Icon only, at every width. The label was the widest thing on the
            right and it named an action people take once a session. The
            aria-label and the tooltip still say it in words. */}
        <button
          type="button"
          className="g-icon-btn g-bar__signout"
          onClick={() => { logout(); router.push('/login'); }}
          aria-label="Sign out"
          title="Sign out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
