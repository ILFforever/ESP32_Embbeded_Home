'use client';

import { useId } from 'react';

/**
 * The compact trend line from the mockups.
 *
 * Why this exists: the dashboard shipped with instantaneous values only,
 * so you could read 27.9 °C but not that it was climbing. "Summary before
 * detail, trend at a glance" was the point of the layout, and every metric
 * already carries a history array.
 *
 * Deliberately hand-rolled SVG rather than Recharts: this is four elements
 * and it must match .g-spark in globals.css exactly. Recharts stays for
 * the full charts in the expanded modals.
 *
 * Colour comes from currentColor via the tone class, so it follows the
 * theme. Never hardcode a hex here — it will be wrong in one theme.
 */

const W = 240;
const H = 62;
const PAD = 6; // room for the endpoint dot's radius + stroke

export type SparkTone = 'accent' | 'ok' | 'warn' | 'crit';

interface SparklineProps {
  values: number[];
  /** Sentence-long description of the actual range, for screen readers. */
  label: string;
  tone?: SparkTone;
  className?: string;
}

export default function Sparkline({ values, label, tone = 'accent', className = '' }: SparklineProps) {
  const gradientId = useId();

  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null; // one point is not a trend

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;

  const pts = clean.map((v, i) => {
    const x = (i / (clean.length - 1)) * (W - PAD);
    const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
    return [Number(x.toFixed(1)), Number(y.toFixed(1))] as const;
  });

  const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const [lastX, lastY] = pts[pts.length - 1];
  // close the area down to the baseline, squaring off the right edge so
  // the fill reaches the same x as the line
  const area = `M${pts.map(([x, y]) => `${x},${y}`).join(' L')} L${W},${lastY} L${W},${H} L0,${H} Z`;

  const toneClass = tone === 'accent' ? '' : ` g-spark--${tone}`;

  return (
    <svg
      className={`g-spark${toneClass}${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <polyline className="g-spark__line" points={line} />
      <circle className="g-spark__dot" cx={lastX} cy={lastY} r={4} />
    </svg>
  );
}
