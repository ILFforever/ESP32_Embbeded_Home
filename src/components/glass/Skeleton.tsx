'use client';

import React from 'react';
import GlassBar from '@/components/glass/GlassBar';

type PageSkeletonVariant = 'dashboard' | 'access' | 'admin' | 'plan' | 'device';

interface PageSkeletonProps {
  label: string;
  variant?: PageSkeletonVariant;
  /* The toolbar is static chrome — it needs no data, so a skeleton stood in
     for something that was already ready to draw. Every loading path in the
     app went through here, which is why the bar appeared to vanish on load
     and then pop back. It now renders for real. Pass false only where the
     nav would be wrong to offer: the redirect to sign-in. */
  chrome?: boolean;
}

interface ContentSkeletonProps {
  label: string;
  rows?: number;
  tiles?: number;
  className?: string;
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return <span className={`g-skeleton ${className}`.trim()} />;
}

export function ContentSkeleton({
  label,
  rows = 3,
  tiles = 0,
  className = '',
}: ContentSkeletonProps) {
  return (
    <div className={`g-content-skeleton ${className}`.trim()} aria-busy="true">
      <span className="g-sr-only" role="status">{label}</span>
      <div aria-hidden="true">
        {tiles > 0 && (
          <div className="g-content-skeleton__tiles">
            {Array.from({ length: tiles }, (_, index) => (
              <div className="g-content-skeleton__tile" key={index}>
                <SkeletonLine className="g-skeleton--eyebrow" />
                <SkeletonLine className="g-skeleton--metric" />
              </div>
            ))}
          </div>
        )}
        <div className="g-content-skeleton__rows">
          {Array.from({ length: rows }, (_, index) => (
            <div className="g-content-skeleton__row" key={index}>
              <SkeletonLine className="g-skeleton--dot" />
              <div>
                <SkeletonLine className="g-skeleton--line" />
                <SkeletonLine className="g-skeleton--line-short" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton({ label, variant = 'dashboard', chrome = true }: PageSkeletonProps) {
  const metricCount = variant === 'access' || variant === 'plan' ? 0 : variant === 'device' ? 3 : 4;
  const cardCount = variant === 'access' ? 3 : variant === 'admin' || variant === 'plan' ? 2 : variant === 'device' ? 4 : 6;

  return (
    <main className={`g-page g-skeleton-page g-skeleton-page--${variant}`} aria-busy="true">
      <span className="g-sr-only" role="status">{label}</span>
      {/* Outside the aria-hidden wrapper below: the bar is real, working
          navigation during the load, not a placeholder to be skipped over. */}
      {chrome ? (
        <GlassBar />
      ) : (
        <div className="g-pane g-skeleton-toolbar" aria-hidden="true">
          <SkeletonLine className="g-skeleton--circle" />
          <SkeletonLine className="g-skeleton--toolbar-title" />
          <div className="g-spacer" />
          <SkeletonLine className="g-skeleton--circle" />
          <SkeletonLine className="g-skeleton--pill" />
        </div>
      )}
      <div aria-hidden="true">
        <div className="g-skeleton-title">
          <SkeletonLine className="g-skeleton--heading" />
          <SkeletonLine className="g-skeleton--lede" />
        </div>

        {metricCount > 0 && (
          <div className="g-skeleton-metrics">
            {Array.from({ length: metricCount }, (_, index) => (
              <div className="g-pane g-card g-skeleton-metric" key={index}>
                <SkeletonLine className="g-skeleton--eyebrow" />
                <SkeletonLine className="g-skeleton--metric" />
              </div>
            ))}
          </div>
        )}

        <div className="g-skeleton-layout">
          {Array.from({ length: cardCount }, (_, index) => (
            <section className="g-pane g-card g-skeleton-card" key={index}>
              <header>
                <SkeletonLine className="g-skeleton--card-title" />
                <SkeletonLine className="g-skeleton--pill" />
              </header>
              <SkeletonLine className="g-skeleton--feature" />
              <SkeletonLine className="g-skeleton--line" />
              <SkeletonLine className="g-skeleton--line-short" />
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
