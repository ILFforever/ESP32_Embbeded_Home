/**
 * Alert Scoring System - Examples and Test Cases
 *
 * This file demonstrates how the alert scoring system works
 * with real examples from your API data.
 */

import type { Alert } from '@/types/dashboard';
import { calculateAlertScoreWithBreakdown, sortAlertsByPriority } from './alertScoring';

// Example alerts from your API response
const exampleAlerts: Alert[] = [
  // Recent unread unknown person - should score very high
  {
    id: "db_001_face_recent_unknown",
    level: "WARN",
    message: "Unknown person detected at door",
    source: "db_001",
    tags: ["face-detection", "unknown"],
    metadata: {
      event_id: "test123",
      name: "Unknown",
      confidence: 0,
      image_url: "https://example.com/image.jpg"
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 minutes ago
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    read: false
  },

  // Recent unread known person with low confidence - should score high
  {
    id: "db_001_face_low_confidence",
    level: "INFO",
    message: "Face detected: HAM",
    source: "db_001",
    tags: ["face-detection", "recognized"],
    metadata: {
      event_id: "test456",
      name: "HAM",
      confidence: 0.51,
      image_url: "https://example.com/image2.jpg"
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    read: false
  },

  // Recent unread known person with high confidence - should score medium
  {
    id: "db_001_face_high_confidence",
    level: "INFO",
    message: "Face detected: HAM",
    source: "db_001",
    tags: ["face-detection", "recognized"],
    metadata: {
      event_id: "test789",
      name: "HAM",
      confidence: 0.95,
      image_url: "https://example.com/image3.jpg"
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), // 2 hours ago
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    read: false
  },

  // Old read unknown person - should score low
  {
    id: "db_001_face_old_unknown",
    level: "WARN",
    message: "Unknown person detected at door",
    source: "db_001",
    tags: ["face-detection", "unknown"],
    metadata: {
      event_id: "test101",
      name: "Unknown",
      confidence: 0,
      image_url: "https://example.com/image4.jpg"
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(), // 7 days ago
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    read: true,
    read_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString()
  },

  // Critical alert - should score highest
  {
    id: "sys_001_critical",
    level: "IMPORTANT",
    message: "System critical error",
    source: "sys_001",
    tags: ["system", "error"],
    metadata: {},
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(), // 10 minutes ago
    created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    read: false
  }
];

// Run scoring on example alerts
console.log("=== Alert Scoring System Examples ===\n");

exampleAlerts.forEach((alert, index) => {
  const scored = calculateAlertScoreWithBreakdown(alert);
  console.log(`Alert ${index + 1}: ${alert.message}`);
  console.log(`  Total Score: ${scored.score}`);
  console.log(`  Breakdown:`);
  console.log(`    - Severity: ${scored.scoreBreakdown?.severity}`);
  console.log(`    - Tag Boost: ${scored.scoreBreakdown?.tagBoost.toFixed(1)}`);
  console.log(`    - Recency Factor: x${scored.scoreBreakdown?.recencyFactor.toFixed(2)}`);
  console.log(`    - Read Factor: x${scored.scoreBreakdown?.readFactor.toFixed(2)}`);
  console.log(`  Priority Category: ${scored.score >= 70 ? 'CRITICAL' : scored.score >= 50 ? 'HIGH' : scored.score >= 30 ? 'MEDIUM' : 'LOW'}`);
  console.log('');
});

// Sort by priority
const sorted = sortAlertsByPriority(exampleAlerts);
console.log("=== Sorted by Priority (Highest to Lowest) ===\n");
sorted.forEach((alert, index) => {
  console.log(`${index + 1}. [Score: ${alert.score}] ${alert.message} (${alert.read ? 'READ' : 'UNREAD'})`);
});

/**
 * Expected scoring behavior. Score = (severity + tagBoost) x recency x read.
 *
 * 1. Critical unread system alert (10 min ago):
 *    (72 IMPORTANT + 0) x 1.00 x 1 = ~72 (CRITICAL)
 *
 * 2. Recent unread unknown person (30 min ago):
 *    (52 WARN + 10 unknown face) x 1.00 x 1 = ~62 (HIGH, urgent)
 *
 * 3. Recent unread low confidence known person (1 hour ago):
 *    (12 INFO + 3.9 shaky match) x 1.00 x 1 = ~16 (LOW)
 *
 * 4. Recent unread high confidence known person (2 hours ago):
 *    (12 INFO + 0.4) x 0.98 x 1 = ~12 (LOW)
 *
 * 5. Old read unknown person (7 days ago):
 *    (52 WARN + 10 unknown face) x 0.60 x 0.5 = ~19 (LOW)
 *
 * Cases 3 and 4 are the point of the rewrite. Under the old additive
 * model they scored ~65 and ~60 — both HIGH, both counted as urgent —
 * because unread (30) and recent (20) alone cleared the 50-point urgent
 * threshold before severity was consulted. A recognised housemate walking
 * through their own front door is not an urgent event, and neither is a
 * board acknowledging a volume command.
 */
