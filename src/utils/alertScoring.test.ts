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
  console.log(`    - Level Score: ${scored.scoreBreakdown?.levelScore}`);
  console.log(`    - Read Status Score: ${scored.scoreBreakdown?.readStatusScore}`);
  console.log(`    - Recency Score: ${scored.scoreBreakdown?.recencyScore.toFixed(1)}`);
  console.log(`    - Recognition Score: ${scored.scoreBreakdown?.recognitionScore}`);
  console.log(`    - Confidence Score: ${scored.scoreBreakdown?.confidenceScore.toFixed(1)}`);
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
 * Expected scoring behavior:
 *
 * 1. Critical unread system alert (10 min ago):
 *    - Level: 40 (IMPORTANT)
 *    - Read: 30 (unread)
 *    - Recency: 20 (recent)
 *    - Recognition: 0 (not face detection)
 *    - Confidence: 0 (not applicable)
 *    = ~90 points (CRITICAL priority)
 *
 * 2. Recent unread unknown person (30 min ago):
 *    - Level: 25 (WARN)
 *    - Read: 30 (unread)
 *    - Recency: 20 (very recent)
 *    - Recognition: 10 (unknown)
 *    - Confidence: 0 (not applicable)
 *    = ~85 points (CRITICAL priority)
 *
 * 3. Recent unread low confidence known person (1 hour ago):
 *    - Level: 10 (INFO)
 *    - Read: 30 (unread)
 *    - Recency: 20 (recent)
 *    - Recognition: 0 (known)
 *    - Confidence: 4.9 (low confidence = higher score)
 *    = ~65 points (HIGH priority)
 *
 * 4. Recent unread high confidence known person (2 hours ago):
 *    - Level: 10 (INFO)
 *    - Read: 30 (unread)
 *    - Recency: 19 (recent)
 *    - Recognition: 0 (known)
 *    - Confidence: 0.5 (high confidence = low score)
 *    = ~60 points (HIGH priority)
 *
 * 5. Old read unknown person (7 days ago):
 *    - Level: 25 (WARN)
 *    - Read: 0 (read)
 *    - Recency: ~5 (old)
 *    - Recognition: 10 (unknown)
 *    - Confidence: 0 (not applicable)
 *    = ~40 points (MEDIUM priority)
 */
