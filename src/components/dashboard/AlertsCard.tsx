import React from 'react';
import { AlertTriangle, Info, XCircle, Check } from 'lucide-react';
import type { Alert } from '@/types/dashboard';
import { alertLevelToType } from '@/types/dashboard';
import { markAlertAsRead } from '@/services/devices.service';

interface AlertsCardProps {
  alerts: Alert[];
  isExpanded?: boolean;
  onRefresh?: () => void;
}

export function AlertsCard({ alerts, isExpanded = false, onRefresh }: AlertsCardProps) {
  const getAlertIcon = (level: 'INFO' | 'WARN' | 'IMPORTANT') => {
    const type = alertLevelToType(level);
    switch (type) {
      case 'critical':
        return <XCircle className="alert-icon critical" />;
      case 'warning':
        return <AlertTriangle className="alert-icon warning" />;
      case 'info':
        return <Info className="alert-icon info" />;
      default:
        return <Info className="alert-icon" />;
    }
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
    // Generate a title based on tags and source
    if (alert.tags.includes('face-detection')) {
      if (alert.tags.includes('unknown')) {
        return 'Unknown Person Detected';
      }
      return 'Known Person Detected';
    }
    if (alert.tags.includes('device-log')) {
      if (alert.tags.includes('error')) {
        return `${alert.source}: Error`;
      }
      if (alert.tags.includes('warning')) {
        return `${alert.source}: Warning`;
      }
      return `${alert.source}: Info`;
    }
    return alert.source || 'Alert';
  };

  const unreadAlerts = alerts.filter(a => !a.read);
  const readAlerts = alerts.filter(a => a.read);
  const criticalCount = alerts.filter(a => a.level === 'IMPORTANT' && !a.read).length;

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          <h3>ALERTS</h3>
          {criticalCount > 0 && (
            <span className="badge badge-critical">{criticalCount} CRITICAL</span>
          )}
        </div>
      </div>

      <div className="card-content">
        {!isExpanded ? (
          <div className="alerts-compact">
            {unreadAlerts.length === 0 ? (
              <p className="no-alerts">NO ACTIVE ALERTS</p>
            ) : (
              <div className="alerts-list">
                {unreadAlerts.slice(0, 4).map(alert => (
                  <div key={alert.id} className={`alert-item alert-${alertLevelToType(alert.level)}`}>
                    {getAlertIcon(alert.level)}
                    <div className="alert-content">
                      <p className="alert-title">{getAlertTitle(alert)}</p>
                      <p className="alert-message">{alert.message}</p>
                      <p className="alert-time">{formatTimestamp(alert.timestamp)}</p>
                    </div>
                  </div>
                ))}
                {unreadAlerts.length > 4 && (
                  <p className="alert-more">+{unreadAlerts.length - 5} more alerts</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="alerts-expanded">
            <div className="alerts-section">
              <h4>UNREAD ({unreadAlerts.length})</h4>
              {unreadAlerts.length === 0 ? (
                <p className="no-alerts">NO UNREAD ALERTS</p>
              ) : (
                <div className="alerts-list">
                  {unreadAlerts.map(alert => (
                    <div key={alert.id} className={`alert-item-detailed alert-${alertLevelToType(alert.level)}`}>
                      <div className="alert-header">
                        {getAlertIcon(alert.level)}
                        <div className="alert-meta">
                          <span className="alert-type">{alert.level}</span>
                          <span className="alert-timestamp">
                            {formatTimestamp(alert.timestamp)}
                          </span>
                        </div>
                      </div>
                      <div className="alert-body">
                        <h5>{getAlertTitle(alert)}</h5>
                        <p>{alert.message}</p>
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
              )}
            </div>

            {readAlerts.length > 0 && (
              <div className="alerts-section">
                <h4>READ ({readAlerts.length})</h4>
                <div className="alerts-list">
                  {readAlerts.map(alert => (
                    <div key={alert.id} className={`alert-item-detailed alert-${alertLevelToType(alert.level)} acknowledged`}>
                      <div className="alert-header">
                        {getAlertIcon(alert.level)}
                        <div className="alert-meta">
                          <span className="alert-type">{alert.level}</span>
                          <span className="alert-timestamp">
                            {formatTimestamp(alert.timestamp)}
                          </span>
                        </div>
                      </div>
                      <div className="alert-body">
                        <h5>{getAlertTitle(alert)}</h5>
                        <p>{alert.message}</p>
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
          </div>
        )}
      </div>
    </div>
  );
}
