/**
 * Relative time, written the way a person would say it.
 *
 * The dashboard was rendering raw locale strings — "Unlocked since
 * 12/8/2025, 12:01:26 PM" — which forces the reader to do date arithmetic
 * to work out that a device has been silent for months. Ground rule 9.
 *
 * AlertsCard had its own copy of this; this is the one implementation.
 */
export function relativeTime(input: string | number | Date | null | undefined): string {
  if (!input) return 'never';

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return 'unknown';

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'just now'; // clock skew between device and server

  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(diffMs / 3600000);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(diffMs / 86400000);
  if (days < 7) return `${days}d ago`;

  // Past a week, a date is more useful than a count of days.
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** "Last seen 17 Mar" / "Last seen 4m ago" — for an offline device. */
export function lastSeenLabel(input: string | number | Date | null | undefined): string {
  return `Last seen ${relativeTime(input)}`;
}

/**
 * Time-of-day greeting. "Good morning" was hardcoded, so the dashboard
 * said it at 6:41pm.
 */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
