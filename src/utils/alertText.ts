import type { Alert } from '@/types/dashboard';

/**
 * Plain-language title for an alert.
 *
 * Extracted from AlertsCard so the dashboard's attention card can use the
 * same wording. It previously showed the raw message — "hb_001: Command
 * 'mic_stop' failed" — which is the system describing itself. Ground rule 9:
 * write from the user's side.
 */
export const alertTags = (alert: Alert): string[] => (Array.isArray(alert.tags) ? alert.tags : []);

export function getAlertTitle(alert: Alert): string {
  const tags = alertTags(alert);

  if (tags.includes('face-detection')) {
    return tags.includes('unknown') ? 'Unknown person at the door' : 'Known person at the door';
  }
  if (tags.includes('motion-detected')) return 'Motion at the doorbell';
  if (tags.includes('doorbell')) return 'Doorbell pressed';
  if (tags.includes('device-offline')) return `${alert.source}: Offline`;
  if (tags.includes('device-online')) return `${alert.source}: Online`;
  if (tags.includes('device-restart')) return `${alert.source}: Restarted`;
  if (tags.includes('door-unlocked')) return 'Door unlocked';
  if (tags.includes('door-locked')) return 'Door locked';
  if (tags.includes('window-opened')) return 'Window opened';
  if (tags.includes('access-granted')) return 'Access granted';
  if (tags.includes('access-denied')) return 'Access denied';
  if (tags.includes('unauthorized')) return 'Unauthorized access attempt';
  if (tags.includes('gas-leak')) return 'Gas above threshold';
  if (tags.includes('smoke-detected')) return 'Smoke detected';
  if (tags.includes('fire')) return 'Fire alert';
  if (tags.includes('high-temperature')) return 'High temperature';
  if (tags.includes('low-temperature')) return 'Low temperature';
  if (tags.includes('high-humidity')) return 'High humidity';
  if (tags.includes('low-humidity')) return 'Low humidity';
  if (tags.includes('poor-air-quality')) return 'Poor air quality';
  if (tags.includes('low-battery')) return `${alert.source}: Low battery`;
  if (tags.includes('battery-critical')) return `${alert.source}: Critical battery`;
  if (tags.includes('connection-lost')) return `${alert.source}: Connection lost`;
  if (tags.includes('weak-signal')) return `${alert.source}: Weak signal`;
  if (tags.includes('device-log')) {
    if (tags.includes('error')) return `${alert.source}: Error`;
    if (tags.includes('warning')) return `${alert.source}: Warning`;
    return `${alert.source}: Info`;
  }
  // Last resort. Prefer the message over the bare device id — an alert
  // titled "hb_001" tells the reader nothing. Strip a leading "source: "
  // so the title does not repeat the source shown beside it.
  const message = (alert.message || '').trim();
  if (message) {
    const stripped = message.replace(new RegExp(`^${alert.source}\s*:\s*`, 'i'), '').trim();
    return stripped || message;
  }
  return alert.source || 'Alert';
}
