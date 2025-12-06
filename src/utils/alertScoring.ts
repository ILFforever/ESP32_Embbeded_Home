import type { Alert } from '@/types/dashboard';

/**
 * Alert scoring system to prioritize alerts in the dashboard
 * Higher scores = higher priority
 */

export interface ScoredAlert extends Alert {
  score: number;
  scoreBreakdown?: {
    levelScore: number;
    readStatusScore: number;
    recencyScore: number;
    recognitionScore: number;
    confidenceScore: number;
  };
}

/**
 * Calculate priority score for an alert
 * Score ranges from 0 to ~100+
 */
export function calculateAlertScore(alert: Alert, currentTime: Date = new Date()): number {
  let score = 0;

  // 1. Alert Level Score (0-40 points)
  const levelScore = getAlertLevelScore(alert.level);
  score += levelScore;

  // 2. Read Status Score (0-30 points)
  const readStatusScore = alert.read ? 0 : 30;
  score += readStatusScore;

  // 3. Recency Score (0-20 points)
  const recencyScore = getRecencyScore(alert.timestamp, currentTime);
  score += recencyScore;

  // 4. Recognition Score for face-detection alerts (0-10 points)
  const recognitionScore = getRecognitionScore(alert);
  score += recognitionScore;

  // 5. Confidence Score for recognized faces (0-10 points)
  const confidenceScore = getConfidenceScore(alert);
  score += confidenceScore;

  return Math.round(score * 10) / 10; // Round to 1 decimal place
}

/**
 * Calculate detailed score breakdown for an alert
 */
export function calculateAlertScoreWithBreakdown(alert: Alert, currentTime: Date = new Date()): ScoredAlert {
  const levelScore = getAlertLevelScore(alert.level);
  const readStatusScore = alert.read ? 0 : 30;
  const recencyScore = getRecencyScore(alert.timestamp, currentTime);
  const recognitionScore = getRecognitionScore(alert);
  const confidenceScore = getConfidenceScore(alert);

  const totalScore = levelScore + readStatusScore + recencyScore + recognitionScore + confidenceScore;

  return {
    ...alert,
    score: Math.round(totalScore * 10) / 10,
    scoreBreakdown: {
      levelScore,
      readStatusScore,
      recencyScore,
      recognitionScore,
      confidenceScore,
    },
  };
}

/**
 * Score based on alert level
 * IMPORTANT: 40 points
 * WARN: 25 points
 * INFO: 10 points
 */
function getAlertLevelScore(level: 'INFO' | 'WARN' | 'IMPORTANT'): number {
  switch (level) {
    case 'IMPORTANT':
      return 40;
    case 'WARN':
      return 25;
    case 'INFO':
      return 10;
    default:
      return 0;
  }
}

/**
 * Score based on how recent the alert is
 * Returns 0-20 points with exponential decay
 * - Last hour: 20 points
 * - Last 6 hours: 15-20 points
 * - Last day: 10-15 points
 * - Last week: 5-10 points
 * - Older: 0-5 points
 */
function getRecencyScore(timestamp: string, currentTime: Date): number {
  const alertTime = new Date(timestamp);
  const diffMs = currentTime.getTime() - alertTime.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return 20;
  if (diffHours < 6) return 20 - (diffHours - 1) * 1; // 15-20
  if (diffHours < 24) return 15 - ((diffHours - 6) / 18) * 5; // 10-15
  if (diffHours < 168) return 10 - ((diffHours - 24) / 144) * 5; // 5-10 (1 week)

  // Older than a week: exponential decay from 5 to 0
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return Math.max(0, 5 * Math.exp(-(diffDays - 7) / 7));
}

/**
 * Score based on face recognition status
 * Unknown faces are higher priority than known faces
 * - Unknown person: 10 points
 * - Known person: 0 points
 * - Non-face-detection: 0 points
 */
function getRecognitionScore(alert: Alert): number {
  if (!alert.tags.includes('face-detection')) {
    return 0;
  }

  if (alert.tags.includes('unknown')) {
    return 10;
  }

  return 0;
}

/**
 * Score based on recognition confidence
 * Lower confidence = higher priority (less certain = needs attention)
 * Only applies to recognized faces (INFO level face-detection alerts)
 * - Confidence 0: 10 points
 * - Confidence 0.5: 5 points
 * - Confidence 1.0: 0 points
 */
function getConfidenceScore(alert: Alert): number {
  // Only apply to recognized faces
  if (!alert.tags.includes('face-detection') || alert.tags.includes('unknown')) {
    return 0;
  }

  // Get confidence from metadata
  const confidence = alert.metadata?.confidence ?? 1;

  // Invert confidence: lower confidence = higher score
  // Confidence ranges from 0 to 1, score ranges from 10 to 0
  return Math.max(0, 10 * (1 - confidence));
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
