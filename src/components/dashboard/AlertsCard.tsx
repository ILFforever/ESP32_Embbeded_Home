import React, { useMemo, useState } from 'react';
import { AlertTriangle, Info, XCircle, Check, ChevronLeft, ChevronRight, Users, Shield, HardDrive, AlertCircle, ToyBrick, KeyRound, Siren, Move, Bell, Computer } from 'lucide-react';
import type { Alert } from '@/types/dashboard';
import { alertLevelToType } from '@/types/dashboard';
import { markAlertAsRead } from '@/services/devices.service';
import { sortAlertsByPriority, getAlertPriorityCategory, type ScoredAlert } from '@/utils/alertScoring';
import { AlertCategoryCard } from './AlertCategoryCard';

interface AlertsCardProps {
  alerts: Alert[];
  isExpanded?: boolean;
  onRefresh?: () => void;
  onExpand?: () => void;
}

export function AlertsCard({ alerts, isExpanded = false, onRefresh, onExpand }: AlertsCardProps) {
  // Sort and filter alerts
  const sortedAlerts = useMemo(() => {
    const allSortedAlerts = sortAlertsByPriority(alerts);

    // Separate unread unknown person alerts
    const unreadUnknownFaceAlerts = allSortedAlerts.filter(
      alert => !alert.read && alert.tags.includes('face-detection') && alert.tags.includes('unknown')
    );

    // Get the other alerts
    const otherAlerts = allSortedAlerts.filter(
      alert => !unreadUnknownFaceAlerts.some(unknown => unknown.id === alert.id)
    );

    // Limit the number of unknown person alerts to the last 3
    const limitedUnknownAlerts = unreadUnknownFaceAlerts.slice(0, 3);

    // Re-combine and sort the alerts to maintain overall order
    return [...limitedUnknownAlerts, ...otherAlerts].sort((a, b) => b.score - a.score);
  }, [alerts]);

  // Pagination state for read alerts
  const [readAlertsPage, setReadAlertsPage] = useState(1);
  const readAlertsPerPage = 5;

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

  const getPriorityBadge = (alert: ScoredAlert) => {
    const category = getAlertPriorityCategory(alert.score);
    const badgeClass = `priority-badge priority-${category}`;

    return (
      <span className={badgeClass} title={`Priority Score: ${alert.score}`}>
        {category.toUpperCase()}
      </span>
    );
  };

  const unreadAlerts = sortedAlerts.filter(a => !a.read);
  const readAlerts = sortedAlerts.filter(a => a.read);
  const highPriorityCount = sortedAlerts.filter(a => !a.read && a.score >= 50).length;

  // Pagination calculations for read alerts
  const totalReadPages = Math.ceil(readAlerts.length / readAlertsPerPage);
  const startIndex = (readAlertsPage - 1) * readAlertsPerPage;
  const endIndex = startIndex + readAlertsPerPage;
  const paginatedReadAlerts = readAlerts.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    setReadAlertsPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setReadAlertsPage(prev => Math.min(totalReadPages, prev + 1));
  };

  const getAlertCategory = (alert: Alert): string => {
    if (alert.tags.includes('face-detection') && alert.tags.includes('unknown')) {
      return 'Unknown Faces';
    }
    if (alert.tags.includes('face-detection')) {
      return 'Known Faces';
    }
    if (alert.tags.includes('motion-detected')) {
      return 'Motion Detected';
    }
    if (alert.source === 'doorbell') {
      return 'Doorbell';
    }
    if (alert.tags.includes('device-restart') || alert.tags.includes('device-offline')) {
      return 'Device Status';
    }
    if (alert.tags.includes('device-log')) {
      return 'Board Errors';
    }
    if (alert.tags.includes('door-unlocked') || alert.tags.includes('window-opened')) {
      return 'Security';
    }
    if (alert.tags.includes('gas-leak') || alert.tags.includes('smoke-detected')) {
      return 'Safety';
    }
    if (alert.source === 'system') {
        return 'System';
    }
    return 'General';
  };

  const alertCategories = useMemo(() => {
    const categories: Record<string, Alert[]> = {};

    unreadAlerts.forEach(alert => {
      const category = getAlertCategory(alert);
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(alert);
    });

    return Object.entries(categories)
      .map(([name, alerts]) => ({ name, alerts, count: alerts.length }))
      .filter(category => category.count > 0)
      .sort((a, b) => b.count - a.count); // Also sort by count
  }, [unreadAlerts]);

  const getCategoryIcon = (categoryName: string) => {
    switch (categoryName) {
      case 'Unknown Faces':
        return <Users />;
      case 'Known Faces':
        return <Users />;
      case 'Motion Detected':
        return <Move />;
      case 'Doorbell':
        return <Bell />;
      case 'Device Status':
        return <HardDrive />;
      case 'Board Errors':
        return <ToyBrick />;
      case 'Security':
        return <KeyRound />;
      case 'Safety':
        return <Siren />;
      case 'System':
        return <Computer />;
      default:
        return <AlertCircle />;
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          <h3>ALERTS</h3>
          {highPriorityCount > 0 && (
            <span className="badge badge-critical">{highPriorityCount} HIGH PRIORITY</span>
          )}
        </div>
      </div>

      <div className="card-content">
        {!isExpanded ? (
          <div className="alerts-compact-categories">
            {unreadAlerts.length === 0 ? (
              <p className="no-alerts">NO ACTIVE ALERTS</p>
            ) : (
              <div className="category-cards-grid">
                {alertCategories.map(category => (
                  <AlertCategoryCard
                    key={category.name}
                    category={category.name}
                    count={category.count}
                    icon={getCategoryIcon(category.name)}
                    onClick={() => onExpand && onExpand()}
                  />
                ))}
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
              )}
            </div>

            {readAlerts.length > 0 && (
              <div className="alerts-section">
                <h4>READ ({readAlerts.length})</h4>
                <div className="alerts-list">
                  {paginatedReadAlerts.map(alert => (
                    <div key={alert.id} className={`alert-item-detailed alert-${alertLevelToType(alert.level)} acknowledged`}>
                      <div className="alert-header">
                        {getAlertIcon(alert.level)}
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
                {totalReadPages > 1 && (
                  <div className="pagination-controls">
                    <button
                      className="pagination-btn"
                      onClick={handlePreviousPage}
                      disabled={readAlertsPage === 1}
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>
                    <span className="pagination-info">
                      Page {readAlertsPage} of {totalReadPages}
                    </span>
                    <button
                      className="pagination-btn"
                      onClick={handleNextPage}
                      disabled={readAlertsPage === totalReadPages}
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
