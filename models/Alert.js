const { getFirestore, admin } = require('../config/firebase');

// Alert levels
const ALERT_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  IMPORTANT: 'IMPORTANT'
};

// Alert priorities (for sorting)
const ALERT_PRIORITIES = {
  IMPORTANT: 3,
  WARN: 2,
  INFO: 1
};

class Alert {
  constructor(data) {
    this.id = data.id || null;
    this.level = data.level || ALERT_LEVELS.INFO;
    this.message = data.message || '';
    this.source = data.source || 'system';
    this.tags = data.tags || [];
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || new Date();
    this.read = data.read || false;
    this.created_at = data.created_at || new Date();
  }

  // Validation
  static validate(alertData) {
    const errors = [];

    if (!alertData.message) {
      errors.push('Message is required');
    }

    if (alertData.level && !Object.values(ALERT_LEVELS).includes(alertData.level)) {
      errors.push(`Invalid level. Must be one of: ${Object.values(ALERT_LEVELS).join(', ')}`);
    }

    return errors;
  }

  // Get priority value for sorting
  static getPriority(level) {
    return ALERT_PRIORITIES[level] || 0;
  }

  // Create alert in Firestore
  static async create(alertData) {
    const errors = Alert.validate(alertData);
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    const db = getFirestore();

    const newAlert = {
      level: alertData.level || ALERT_LEVELS.INFO,
      message: alertData.message,
      source: alertData.source || 'system',
      tags: alertData.tags || [],
      metadata: alertData.metadata || {},
      timestamp: alertData.timestamp || admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('alerts').add(newAlert);

    console.log(`[Alert] Created alert [${newAlert.level}] from ${newAlert.source}: ${newAlert.message}`);

    return new Alert({ id: docRef.id, ...newAlert });
  }

  // Find alert by ID
  static async findById(id) {
    const db = getFirestore();
    const doc = await db.collection('alerts').doc(id).get();

    if (!doc.exists) {
      return null;
    }

    return new Alert({ id: doc.id, ...doc.data() });
  }

  // Get alerts with filtering and sorting
  static async getAlerts(options = {}) {
    const {
      level = null,
      source = null,
      tags = null,
      read = null,
      limit = 50,
      sortBy = 'priority', // 'priority', 'timestamp', 'created_at'
      sortOrder = 'desc' // 'asc' or 'desc'
    } = options;

    const db = getFirestore();
    let query = db.collection('alerts');

    // Apply filters
    if (level) {
      query = query.where('level', '==', level);
    }

    if (source) {
      query = query.where('source', '==', source);
    }

    if (read !== null) {
      query = query.where('read', '==', read);
    }

    // Apply tags filter (Firestore array-contains only supports single value)
    if (tags && tags.length > 0) {
      query = query.where('tags', 'array-contains', tags[0]);
    }

    // Get all documents first (we'll sort by priority in memory)
    const snapshot = await query.get();

    if (snapshot.empty) {
      return [];
    }

    // Convert to Alert objects
    let alerts = snapshot.docs.map(doc => {
      const data = doc.data();
      return new Alert({
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate?.() || data.timestamp,
        created_at: data.created_at?.toDate?.() || data.created_at
      });
    });

    // Sort alerts
    if (sortBy === 'priority') {
      // Sort by priority first (IMPORTANT > WARN > INFO), then by timestamp (newest first)
      alerts.sort((a, b) => {
        const priorityDiff = Alert.getPriority(b.level) - Alert.getPriority(a.level);
        if (priorityDiff !== 0) return priorityDiff;

        // If same priority, sort by timestamp
        const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
        const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
        return timeB - timeA;
      });
    } else if (sortBy === 'timestamp') {
      alerts.sort((a, b) => {
        const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
        const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
    } else if (sortBy === 'created_at') {
      alerts.sort((a, b) => {
        const timeA = a.created_at instanceof Date ? a.created_at.getTime() : 0;
        const timeB = b.created_at instanceof Date ? b.created_at.getTime() : 0;
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
    }

    // Apply limit
    if (limit) {
      alerts = alerts.slice(0, limit);
    }

    return alerts;
  }

  // Mark alert as read
  static async markAsRead(id) {
    const db = getFirestore();
    await db.collection('alerts').doc(id).update({
      read: true,
      read_at: admin.firestore.FieldValue.serverTimestamp()
    });

    return Alert.findById(id);
  }

  // Mark multiple alerts as read
  static async markMultipleAsRead(ids) {
    const db = getFirestore();
    const batch = db.batch();

    ids.forEach(id => {
      const alertRef = db.collection('alerts').doc(id);
      batch.update(alertRef, {
        read: true,
        read_at: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();
    console.log(`[Alert] Marked ${ids.length} alerts as read`);
  }

  // Delete alert
  static async delete(id) {
    const db = getFirestore();
    const alert = await Alert.findById(id);

    if (!alert) {
      return null;
    }

    await db.collection('alerts').doc(id).delete();
    console.log(`[Alert] Deleted alert ${id}`);
    return alert;
  }

  // Delete old alerts (cleanup)
  static async deleteOldAlerts(daysOld = 30) {
    const db = getFirestore();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const snapshot = await db.collection('alerts')
      .where('created_at', '<', admin.firestore.Timestamp.fromDate(cutoffDate))
      .get();

    if (snapshot.empty) {
      console.log('[Alert] No old alerts to delete');
      return 0;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`[Alert] Deleted ${snapshot.size} old alerts (older than ${daysOld} days)`);
    return snapshot.size;
  }

  // Convert to JSON (for API responses)
  toJSON() {
    return {
      id: this.id,
      level: this.level,
      message: this.message,
      source: this.source,
      tags: this.tags,
      metadata: this.metadata,
      timestamp: this.timestamp,
      read: this.read,
      created_at: this.created_at
    };
  }
}

module.exports = Alert;
module.exports.ALERT_LEVELS = ALERT_LEVELS;
