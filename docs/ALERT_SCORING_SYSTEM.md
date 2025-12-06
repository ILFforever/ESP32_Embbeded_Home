# Alert Scoring System

## Overview

The Alert Scoring System prioritizes alerts in the dashboard based on multiple factors to ensure the most important alerts are shown first. Each alert receives a priority score (0-100+), with higher scores indicating higher priority.

## Scoring Components

### 1. Alert Level Score (0-40 points)

Based on the severity level of the alert:

| Level | Points | Description |
|-------|--------|-------------|
| IMPORTANT | 40 | Critical system alerts requiring immediate attention |
| WARN | 25 | Warning-level alerts indicating potential issues |
| INFO | 10 | Informational alerts |

### 2. Read Status Score (0-30 points)

| Status | Points | Description |
|--------|--------|-------------|
| Unread | 30 | New alerts that haven't been acknowledged |
| Read | 0 | Alerts that have been acknowledged |

### 3. Recency Score (0-20 points)

Based on how recent the alert is, with exponential decay over time:

| Time Range | Points | Description |
|------------|--------|-------------|
| < 1 hour | 20 | Very recent alerts |
| 1-6 hours | 15-20 | Recent alerts |
| 6-24 hours | 10-15 | Alerts from today |
| 1-7 days | 5-10 | Alerts from this week |
| > 7 days | 0-5 | Older alerts (exponential decay) |

### 4. Recognition Score (0-10 points)

For face-detection alerts only:

| Type | Points | Description |
|------|--------|-------------|
| Unknown person | 10 | Unrecognized faces require attention |
| Known person | 0 | Recognized faces are less urgent |
| Other alerts | 0 | Not applicable |

### 5. Confidence Score (0-10 points)

For recognized faces only (inverse relationship):

| Confidence | Points | Description |
|------------|--------|-------------|
| 0.0 (0%) | 10 | Very uncertain recognition |
| 0.5 (50%) | 5 | Moderate confidence |
| 1.0 (100%) | 0 | High confidence recognition |

**Note:** Lower confidence = higher score, because uncertain recognitions may need verification.

## Priority Categories

Alerts are categorized based on their total score:

| Category | Score Range | Badge Color | Description |
|----------|-------------|-------------|-------------|
| CRITICAL | ≥ 70 | Red (pulsing) | Requires immediate attention |
| HIGH | 50-69 | Orange | Important, should be addressed soon |
| MEDIUM | 30-49 | Blue | Normal priority |
| LOW | < 30 | Gray | Low priority |

## Scoring Examples

### Example 1: Recent Unread Unknown Person
```
- Level: WARN = 25 points
- Read Status: Unread = 30 points
- Recency: 30 minutes ago = 20 points
- Recognition: Unknown = 10 points
- Confidence: N/A = 0 points
Total: 85 points → CRITICAL priority
```

### Example 2: Recent Unread Known Person (Low Confidence)
```
- Level: INFO = 10 points
- Read Status: Unread = 30 points
- Recency: 1 hour ago = 20 points
- Recognition: Known = 0 points
- Confidence: 51% (0.51) = 4.9 points
Total: 64.9 points → HIGH priority
```

### Example 3: Recent Unread Known Person (High Confidence)
```
- Level: INFO = 10 points
- Read Status: Unread = 30 points
- Recency: 2 hours ago = 19 points
- Recognition: Known = 0 points
- Confidence: 95% (0.95) = 0.5 points
Total: 59.5 points → HIGH priority
```

### Example 4: Old Read Unknown Person
```
- Level: WARN = 25 points
- Read Status: Read = 0 points
- Recency: 7 days ago = ~5 points
- Recognition: Unknown = 10 points
- Confidence: N/A = 0 points
Total: 40 points → MEDIUM priority
```

### Example 5: Critical System Alert
```
- Level: IMPORTANT = 40 points
- Read Status: Unread = 30 points
- Recency: 10 minutes ago = 20 points
- Recognition: N/A = 0 points
- Confidence: N/A = 0 points
Total: 90 points → CRITICAL priority
```

## Implementation

### Usage in Components

```typescript
import { sortAlertsByPriority } from '@/utils/alertScoring';

// Sort alerts by priority
const sortedAlerts = sortAlertsByPriority(alerts);

// Display top 5 priority alerts
const topAlerts = sortedAlerts.slice(0, 5);
```

### API

```typescript
// Calculate score for a single alert
const score = calculateAlertScore(alert);

// Calculate score with detailed breakdown
const scoredAlert = calculateAlertScoreWithBreakdown(alert);
console.log(scoredAlert.scoreBreakdown);

// Sort all alerts by priority
const sortedAlerts = sortAlertsByPriority(alerts);

// Get top N priority alerts
const topAlerts = getTopPriorityAlerts(alerts, 10);

// Get priority category
const category = getAlertPriorityCategory(score); // 'critical' | 'high' | 'medium' | 'low'
```

## Display Features

### Dashboard Card
- Shows count of high-priority alerts (score ≥ 50) in the header badge
- Displays alerts sorted by priority score
- Shows top 4 unread alerts in compact view

### Expanded View
- Each alert shows a priority badge with color coding
- Confidence level displayed for recognized faces
- Alerts remain sorted by priority score
- Separate sections for unread and read alerts

## Benefits

1. **Prioritizes Security Threats**: Unknown faces automatically rank higher than known faces
2. **Time-Sensitive**: Recent alerts get more attention than older ones
3. **Confidence-Aware**: Uncertain face recognitions are flagged for verification
4. **User-Friendly**: Visual priority badges make it easy to identify important alerts
5. **Flexible**: Easy to adjust scoring weights for different use cases

## Customization

To adjust scoring weights, modify the values in `src/utils/alertScoring.ts`:

```typescript
// Adjust level scores
function getAlertLevelScore(level: 'INFO' | 'WARN' | 'IMPORTANT'): number {
  switch (level) {
    case 'IMPORTANT': return 40; // Adjust this value
    case 'WARN': return 25;      // Adjust this value
    case 'INFO': return 10;      // Adjust this value
  }
}

// Adjust priority category thresholds
function getAlertPriorityCategory(score: number) {
  if (score >= 70) return 'critical';  // Adjust threshold
  if (score >= 50) return 'high';      // Adjust threshold
  if (score >= 30) return 'medium';    // Adjust threshold
  return 'low';
}
```
