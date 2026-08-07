import type { Alert } from '@/types/dashboard';

/**
 * Alert scoring system to prioritize alerts in the dashboard
 * Higher scores = higher priority
 */

export interface ScoredAlert extends Alert {
  score: number;
  scoreBreakdown?: {
    severity: number;
    tagBoost: number;
    recencyFactor: number;
    readFactor: number;
  };
}

/**
 * Calculate priority score for an alert. 0 to ~100.
 *
 * Severity decides what an alert is worth. Recency and read state only
 * scale it. That distinction is the whole design, and it used to be
 * missing: every component was additive, so unread (30 points) plus
 * arrived-in-the-last-hour (20 points) reached the 50-point urgent
 * threshold on their own, before severity was consulted at all.
 *
 * A routine "Command 'amp_volume' completed" — INFO, the lowest severity
 * there is — scored 10 + 30 + 20 = 60, which the UI labels high priority
 * and counts as urgent. Nothing about it was urgent except that it was
 * new, and everything is new once. That is where "96 urgent" came from.
 *
 * Multiplying instead means a routine acknowledgement cannot climb: an
 * unread INFO alert peaks at 12 however recent it is, while an unread
 * IMPORTANT one stays above the urgent line for days.
 */
export function calculateAlertScore(alert: Alert, currentTime: Date = new Date()): number {
  return calculateAlertScoreWithBreakdown(alert, currentTime).score;
}

/**
 * Calculate detailed score breakdown for an alert
 */
export function calculateAlertScoreWithBreakdown(alert: Alert, currentTime: Date = new Date()): ScoredAlert {
  const severity = getSeverityScore(alert.level);
  /* Added before scaling, not after. A tag says something about the event
     itself — a board dropped off the network, a battery is nearly flat —
     so it belongs with severity and should fade at the same rate. */
  const tagBoost = getTagBoost(alert);
  const recencyFactor = getRecencyFactor(alert.timestamp, currentTime);
  const readFactor = alert.read ? 0.5 : 1;

  const totalScore = (severity + tagBoost) * recencyFactor * readFactor;

  return {
    ...alert,
    score: Math.round(totalScore * 10) / 10,
    scoreBreakdown: { severity, tagBoost, recencyFactor, readFactor },
  };
}

/**
 * What an alert is worth before anything modifies it.
 *
 * These sit deliberately either side of the category thresholds: a fresh
 * unread WARN lands on 'high' and counts as urgent, a fresh unread INFO
 * lands on 'low' and does not. Everything else moves an alert down from
 * there, or up only when a tag says the event is more than its level.
 */
function getSeverityScore(level: 'INFO' | 'WARN' | 'IMPORTANT'): number {
  switch (level) {
    case 'IMPORTANT':
      return 72;
    case 'WARN':
      return 52;
    case 'INFO':
      return 12;
    default:
      return 0;
  }
}

/**
 * How much of its severity an alert keeps as it ages. Never zero — an
 * important alert from last month still outranks a routine one from this
 * morning, which is the ordering a person expects and the old additive
 * recency score could not produce.
 *
 * - Last hour:  1.00
 * - Last 6h:    0.92 - 1.00
 * - Last day:   0.80 - 0.92
 * - Last week:  0.60 - 0.80
 * - Older:      0.50 - 0.60, decaying
 */
function getRecencyFactor(timestamp: string, currentTime: Date): number {
  const alertTime = new Date(timestamp);
  const diffMs = currentTime.getTime() - alertTime.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return 1;
  if (diffHours < 6) return 1 - ((diffHours - 1) / 5) * 0.08;
  if (diffHours < 24) return 0.92 - ((diffHours - 6) / 18) * 0.12;
  if (diffHours < 168) return 0.8 - ((diffHours - 24) / 144) * 0.2;

  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return 0.5 + 0.1 * Math.exp(-(diffDays - 7) / 7);
}

/**
 * Events whose level understates them. A board reporting its own restart
 * at INFO is still a board that restarted, and a low battery is a job to
 * do whatever level it arrives at.
 *
 * Face detection is here too: an unrecognised person is worth more than
 * the same alert about someone known, and a shaky match on a known face
 * is worth more than a confident one, because a bad match is the case a
 * person actually needs to look at.
 */
function getTagBoost(alert: Alert): number {
  const tags = getAlertTags(alert);
  let boost = 0;

  if (tags.includes('device-offline')) boost += 20;
  else if (tags.includes('battery-low')) boost += 20;
  else if (tags.includes('device-restart')) boost += 15;
  else if (tags.includes('firmware-update')) boost += 10;
  else if (tags.includes('device-online')) boost += 5;

  if (tags.includes('face-detection')) {
    if (tags.includes('unknown')) {
      boost += 10;
    } else {
      const confidence = alert.metadata?.confidence ?? 1;
      boost += Math.max(0, 8 * (1 - confidence));
    }
  }

  return boost;
}

function getAlertTags(alert: Alert): string[] {
  return Array.isArray(alert.tags) ? alert.tags : [];
}

/**
 * Sort alerts by priority score (highest first)
 */
export function sortAlertsByPriority(alerts: Alert[]): ScoredAlert[] {
  const currentTime = new Date();

  return alerts
    .map(alert => calculateAlertScoreWithBreakdown(alert, currentTime))
    .sort((a, b) => b.score - a.score);
}

/**
 * Get top N priority alerts
 */
export function getTopPriorityAlerts(alerts: Alert[], limit: number): ScoredAlert[] {
  return sortAlertsByPriority(alerts).slice(0, limit);
}

/**
 * Get priority category for an alert based on score
 */
export function getAlertPriorityCategory(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 70) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

/**
 * Get color class for priority score
 */
export function getPriorityColorClass(score: number): string {
  const category = getAlertPriorityCategory(score);
  return `priority-${category}`;
}

/**
 * The one definition of "urgent".
 *
 * There were two. The dashboard hero counted `level === 'IMPORTANT'` and
 * the alerts card counted `score >= 50`, so the same screen said "none
 * urgent" and "11 urgent" at the same time. Score is the better of the two
 * because it already folds in level, read state, recency and tags — an
 * IMPORTANT alert from March is not urgent, and the level alone cannot
 * know that.
 *
 * Anything that shows the reader a count of things needing attention must
 * come through here.
 */
export const URGENT_SCORE = 50;

export function isUrgent(alert: Alert, now: Date = new Date()): boolean {
  if (alert.read) return false;
  return calculateAlertScore(alert, now) >= URGENT_SCORE;
}

export function countUrgent(alerts: Alert[], now: Date = new Date()): number {
  return alerts.reduce((n, alert) => n + (isUrgent(alert, now) ? 1 : 0), 0);
}
