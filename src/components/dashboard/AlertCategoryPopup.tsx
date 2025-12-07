import React, { useMemo } from 'react';
import { X, Check } from 'lucide-react';
import type { Alert } from '@/types/dashboard';
import { alertLevelToType } from '@/types/dashboard';
import { markAlertAsRead } from '@/services/devices.service';
import { sortAlertsByPriority, getAlertPriorityCategory, type ScoredAlert } from '@/utils/alertScoring';

interface AlertCategoryPopupProps {
  category: string;
  alerts: Alert[];
  icon: React.ReactNode;
  onClose: () => void;
  onRefresh?: () => void;
}

export function AlertCategoryPopup({ category, alerts, icon, onClose, onRefresh }: AlertCategoryPopupProps) {
  const sortedAlerts = useMemo(() => sortAlertsByPriority(alerts), [alerts]);

  const getAlertIcon = (level: 'INFO' | 'WARN' | 'IMPORTANT') => {
    const type = alertLevelToType(level);
    const icons = {
      critical: '⚠️',
      warning: '⚡',
      info: 'ℹ️'
    };
    return icons[type] || 'ℹ️';
  };

  const handleMarkAsRead = async (alertId: string) => {
    const success = await markAlertAsRead(alertId);
    if (success && onRefresh) {
      onRefresh();
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getAlertTitle = (alert: Alert): string => {
    if (alert.tags.includes('face-detection')) {
      if (alert.tags.includes('unknown')) return 'Unknown Person Detected';
      return 'Known Person Detected';
    }
    if (alert.tags.includes('motion-detected')) return 'Motion Detected';
    if (alert.tags.includes('doorbell')) return 'Doorbell Pressed';
    if (alert.tags.includes('device-offline')) return `${alert.source}: Offline`;
    if (alert.tags.includes('device-online')) return `${alert.source}: Online`;
    if (alert.tags.includes('device-restart')) return `${alert.source}: Restarted`;
    if (alert.tags.includes('door-unlocked')) return 'Door Unlocked';
    if (alert.tags.includes('door-locked')) return 'Door Locked';
    if (alert.tags.includes('window-opened')) return 'Window Opened';
    if (alert.tags.includes('access-granted')) return 'Access Granted';
    if (alert.tags.includes('access-denied')) return 'Access Denied';
    if (alert.tags.includes('unauthorized')) return 'Unauthorized Access Attempt';
    if (alert.tags.includes('gas-leak')) return 'Gas Leak Detected';
    if (alert.tags.includes('smoke-detected')) return 'Smoke Detected';
    if (alert.tags.includes('fire')) return 'Fire Alert';
    if (alert.tags.includes('high-temperature')) return 'High Temperature Alert';
    if (alert.tags.includes('low-temperature')) return 'Low Temperature Alert';
    if (alert.tags.includes('high-humidity')) return 'High Humidity Alert';
    if (alert.tags.includes('low-humidity')) return 'Low Humidity Alert';
    if (alert.tags.includes('poor-air-quality')) return 'Poor Air Quality';
    if (alert.tags.includes('low-battery')) return `${alert.source}: Low Battery`;
    if (alert.tags.includes('battery-critical')) return `${alert.source}: Critical Battery`;
    if (alert.tags.includes('connection-lost')) return `${alert.source}: Connection Lost`;
    if (alert.tags.includes('weak-signal')) return `${alert.source}: Weak Signal`;

    if (alert.tags.includes('device-log')) {
      if (alert.tags.includes('error')) return `${alert.source}: Error`;
      if (alert.tags.includes('warning')) return `${alert.source}: Warning`;
      return `${alert.source}: Info`;
    }

    return alert.source || 'Alert';
  };

  const getPriorityBadge = (alert: ScoredAlert) => {
    const priorityCategory = getAlertPriorityCategory(alert.score);
    const badgeClass = `priority-badge priority-${priorityCategory}`;
    return (
      <span className={badgeClass} title={`Priority Score: ${alert.score}`}>
        {priorityCategory.toUpperCase()}
      </span>
    );
  };

  const unreadAlerts = sortedAlerts.filter(a => !a.read);
  const readAlerts = sortedAlerts.filter(a => a.read);

  return (
    <div className="alert-popup-overlay" onClick={onClose}>
      <div className="alert-popup-container" onClick={(e) => e.stopPropagation()}>
        <div className="alert-popup-header">
          <div className="alert-popup-title">
            <span className="alert-popup-icon">{icon}</span>
            <h2>{category}</h2>
            <span className="alert-popup-count">{alerts.length} Total</span>
          </div>
          <button className="alert-popup-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="alert-popup-content">
          {unreadAlerts.length > 0 && (
            <div className="alerts-section">
              <h4>UNREAD ({unreadAlerts.length})</h4>
              <div className="alerts-list">
                {unreadAlerts.map(alert => (
                  <div key={alert.id} className={`alert-item-detailed alert-${alertLevelToType(alert.level)}`}>
                    <div className="alert-header">
                      <span className="alert-icon-emoji">{getAlertIcon(alert.level)}</span>
                      <div className="alert-meta">
                        <span className="alert-type">{alert.level}</span>
                        {getPriorityBadge(alert)}
                        <span className="alert-timestamp">
                          {formatTimestamp(alert.timestamp)}
                        </span>
                      </div>
                    </div>
                    <div className="alert-body">
                      <h5>{getAlertTitle(alert)}</h5>
                      <p>{alert.message}</p>
                      {alert.tags.includes('face-detection') && alert.metadata?.image_url && (
                        <img src={alert.metadata.image_url} alt="Face detection" className="alert-image" />
                      )}
                      {alert.metadata?.confidence !== undefined && alert.metadata.confidence > 0 && (
                        <p className="alert-confidence">
                          CFD: {(alert.metadata.confidence * 100).toFixed(1)}%
                        </p>
                      )}
                      <div className="alert-tags">
                        {alert.tags.map((tag, idx) => (
                          <span key={idx} className="tag">{tag}</span>
                        ))}
                      </div>
                      <div className="alert-footer">
                        <span className="alert-device">Source: {alert.source}</span>
                        <button
                          className="btn-acknowledge"
                          onClick={() => handleMarkAsRead(alert.id)}
                        >
                          <Check size={16} /> MARK AS READ
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {readAlerts.length > 0 && (
            <div className="alerts-section">
              <h4>READ ({readAlerts.length})</h4>
              <div className="alerts-list">
                {readAlerts.map(alert => (
                  <div key={alert.id} className={`alert-item-detailed alert-${alertLevelToType(alert.level)} acknowledged`}>
                    <div className="alert-header">
                      <span className="alert-icon-emoji">{getAlertIcon(alert.level)}</span>
                      <div className="alert-meta">
                        <span className="alert-type">{alert.level}</span>
                        {getPriorityBadge(alert)}
                        <span className="alert-timestamp">
                          {formatTimestamp(alert.timestamp)}
                        </span>
                      </div>
                    </div>
                    <div className="alert-body">
                      <h5>{getAlertTitle(alert)}</h5>
                      <p>{alert.message}</p>
                      {alert.tags.includes('face-detection') && alert.metadata?.image_url && (
                        <img src={alert.metadata.image_url} alt="Face detection" className="alert-image" />
                      )}
                      {alert.metadata?.confidence !== undefined && alert.metadata.confidence > 0 && (
                        <p className="alert-confidence">
                          CFD: {(alert.metadata.confidence * 100).toFixed(1)}%
                        </p>
                      )}
                      <div className="alert-tags">
                        {alert.tags.map((tag, idx) => (
                          <span key={idx} className="tag">{tag}</span>
                        ))}
                      </div>
                      <div className="alert-footer">
                        <span className="alert-device">Source: {alert.source}</span>
                        {alert.read_at && (
                          <span className="alert-read-time">Read {formatTimestamp(alert.read_at)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {alerts.length === 0 && (
            <p className="no-alerts">NO ALERTS IN THIS CATEGORY</p>
          )}
        </div>
      </div>
    </div>
  );
}
