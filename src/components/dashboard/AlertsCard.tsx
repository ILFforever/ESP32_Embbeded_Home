import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Battery,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Computer,
  DoorOpen,
  Droplets,
  Filter,
  HardDrive,
  KeyRound,
  Lock,
  Move,
  Shield,
  Siren,
  Thermometer,
  ToyBrick,
  Users,
  Wifi,
  Wind,
  X,
} from 'lucide-react';
import type { Alert } from '@/types/dashboard';
import { alertLevelToType } from '@/types/dashboard';
import { markAlertAsRead } from '@/services/devices.service';
import { getAlertPriorityCategory, sortAlertsByPriority, type ScoredAlert } from '@/utils/alertScoring';
import { alertTags, getAlertTitle } from '@/utils/alertText';
import { relativeTime } from '@/utils/time';

interface AlertsCardProps {
  alerts: Alert[];
  isExpanded?: boolean;
  onRefresh?: () => void;
  onExpand?: () => void;
}

const levelDotClass = (level: Alert['level']) => {
  const type = alertLevelToType(level);
  if (type === 'critical') return 'g-dot g-dot--crit';
  if (type === 'warning') return 'g-dot g-dot--warn';
  return 'g-dot g-dot--off';
};

const levelChipClass = (level: Alert['level']) => {
  const type = alertLevelToType(level);
  if (type === 'critical') return 'g-chip g-chip--crit';
  if (type === 'warning') return 'g-chip g-chip--warn';
  return 'g-chip';
};

const priorityChipClass = (score: number) => {
  const category = getAlertPriorityCategory(score);
  if (category === 'critical') return 'g-chip g-chip--crit';
  if (category === 'high' || category === 'medium') return 'g-chip g-chip--warn';
  return 'g-chip';
};


export function AlertsCard({ alerts, isExpanded = false, onRefresh }: AlertsCardProps) {
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [popupCategory, setPopupCategory] = useState<string | null>(null);
  const [readAlertsPage, setReadAlertsPage] = useState(1);
  const readAlertsPerPage = 5;

  useEffect(() => {
    if (!popupCategory) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPopupCategory(null);
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [popupCategory]);

  

  const getAlertCategory = (alert: Alert): string => {
    const tags = alertTags(alert);
    const source = alert.source || '';

    if (tags.includes('face-detection') && tags.includes('unknown')) return 'Unknown faces';
    if (tags.includes('face-detection')) return 'Known faces';
    if (tags.includes('motion-detected')) return 'Motion';
    if (source === 'doorbell' || tags.includes('doorbell')) return 'Doorbell';
    if (tags.includes('device-restart') || tags.includes('device-offline') || tags.includes('device-online')) return 'Device status';
    if (tags.includes('device-log') || tags.includes('error') || tags.includes('crash')) return 'Board errors';
    if (source.startsWith('dl_') || tags.includes('door-lock-device')) return 'Door locks';
    if (tags.includes('door-unlocked') || tags.includes('window-opened') || tags.includes('door-locked')) return 'Security';
    if (tags.includes('access-granted') || tags.includes('access-denied') || tags.includes('unauthorized')) return 'Access control';
    if (tags.includes('gas-leak') || tags.includes('smoke-detected') || tags.includes('fire')) return 'Safety';
    if (tags.includes('temperature') || tags.includes('high-temperature') || tags.includes('low-temperature')) return 'Temperature';
    if (tags.includes('humidity') || tags.includes('high-humidity') || tags.includes('low-humidity')) return 'Humidity';
    if (tags.includes('air-quality') || tags.includes('pm25') || tags.includes('co2') || tags.includes('poor-air-quality')) return 'Air quality';
    if (tags.includes('battery') || tags.includes('low-battery') || tags.includes('battery-critical')) return 'Battery';
    if (tags.includes('network') || tags.includes('wifi') || tags.includes('connection-lost') || tags.includes('weak-signal')) return 'Network';
    if (source === 'system' || tags.includes('system')) return 'System';
    return 'General';
  };

  const getCategoryIcon = (categoryName: string) => {
    switch (categoryName) {
      case 'Unknown faces':
      case 'Known faces':
        return <Users size={17} aria-hidden="true" />;
      case 'Motion':
        return <Move size={17} aria-hidden="true" />;
      case 'Doorbell':
        return <Bell size={17} aria-hidden="true" />;
      case 'Device status':
        return <HardDrive size={17} aria-hidden="true" />;
      case 'Board errors':
        return <ToyBrick size={17} aria-hidden="true" />;
      case 'Security':
        return <KeyRound size={17} aria-hidden="true" />;
      case 'Door locks':
        return <Lock size={17} aria-hidden="true" />;
      case 'Access control':
        return <DoorOpen size={17} aria-hidden="true" />;
      case 'Safety':
        return <Siren size={17} aria-hidden="true" />;
      case 'Temperature':
        return <Thermometer size={17} aria-hidden="true" />;
      case 'Humidity':
        return <Droplets size={17} aria-hidden="true" />;
      case 'Air quality':
        return <Wind size={17} aria-hidden="true" />;
      case 'Battery':
        return <Battery size={17} aria-hidden="true" />;
      case 'Network':
        return <Wifi size={17} aria-hidden="true" />;
      case 'System':
        return <Computer size={17} aria-hidden="true" />;
      default:
        return <AlertCircle size={17} aria-hidden="true" />;
    }
  };

  const sortedAlerts = useMemo(() => {
    const allSortedAlerts = sortAlertsByPriority(alerts);
    const unreadUnknownFaceAlerts = allSortedAlerts.filter(
      alert => {
        const tags = alertTags(alert);
        return !alert.read && tags.includes('face-detection') && tags.includes('unknown');
      }
    );
    const otherAlerts = allSortedAlerts.filter(
      alert => !unreadUnknownFaceAlerts.some(unknown => unknown.id === alert.id)
    );

    return [...unreadUnknownFaceAlerts.slice(0, 3), ...otherAlerts].sort((a, b) => b.score - a.score);
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    if (selectedFilters.length === 0) return sortedAlerts;
    return sortedAlerts.filter(alert => selectedFilters.includes(getAlertCategory(alert)));
  }, [sortedAlerts, selectedFilters]);

  const unreadAlerts = filteredAlerts.filter(a => !a.read);
  const readAlerts = filteredAlerts.filter(a => a.read);
  const highPriorityCount = sortedAlerts.filter(a => !a.read && a.score >= 50).length;
  const popupAlerts = popupCategory ? sortedAlerts.filter(alert => getAlertCategory(alert) === popupCategory) : [];

  const availableCategories = useMemo(() => {
    const categories = new Set<string>();
    sortedAlerts.forEach(alert => categories.add(getAlertCategory(alert)));
    const sorted = Array.from(categories).sort();
    const generalIndex = sorted.indexOf('General');
    if (generalIndex > -1) {
      sorted.splice(generalIndex, 1);
      sorted.unshift('General');
    }
    return sorted;
  }, [sortedAlerts]);

  const alertCategories = useMemo(() => {
    const categories: Record<string, Alert[]> = {};

    unreadAlerts.forEach(alert => {
      const category = getAlertCategory(alert);
      categories[category] = categories[category] || [];
      categories[category].push(alert);
    });

    const sorted = Object.entries(categories)
      .map(([name, categoryAlerts]) => ({ name, alerts: categoryAlerts, count: categoryAlerts.length }))
      .filter(category => category.count > 0)
      .sort((a, b) => b.count - a.count);

    const generalIndex = sorted.findIndex(cat => cat.name === 'General');
    if (generalIndex > -1) {
      const [general] = sorted.splice(generalIndex, 1);
      sorted.unshift(general);
    }

    return sorted;
  }, [unreadAlerts]);

  const totalReadPages = Math.ceil(readAlerts.length / readAlertsPerPage);
  const startIndex = (readAlertsPage - 1) * readAlertsPerPage;
  const paginatedReadAlerts = readAlerts.slice(startIndex, startIndex + readAlertsPerPage);

  const handleMarkAsRead = async (alertId: string) => {
    const success = await markAlertAsRead(alertId);
    if (success && onRefresh) onRefresh();
  };

  const toggleFilter = (category: string) => {
    setSelectedFilters(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]);
    setReadAlertsPage(1);
  };

  const renderPriorityBadge = (alert: ScoredAlert) => (
    <span className={priorityChipClass(alert.score)} title={`Priority score: ${alert.score}`}>
      {getAlertPriorityCategory(alert.score)}
    </span>
  );

  const renderAlertRow = (alert: ScoredAlert, read = false) => (
    <div key={alert.id} className="g-list__row">
      <i className={levelDotClass(alert.level)} />
      <p>
        {getAlertTitle(alert)}
        <span>{relativeTime(alert.timestamp)} · {alert.source}</span>
        {isExpanded && (
          <>
            <span>{alert.message}</span>
            {alert.metadata?.confidence !== undefined && alert.metadata.confidence > 0 && (
              <span>Confidence {(alert.metadata.confidence * 100).toFixed(1)}%</span>
            )}
          </>
        )}
      </p>
      <div className="g-row g-row--wrap">
        <span className={levelChipClass(alert.level)}>{alert.level.toLowerCase()}</span>
        {isExpanded && renderPriorityBadge(alert)}
        {!read && isExpanded && (
          <button className="g-btn g-btn--ghost" onClick={() => handleMarkAsRead(alert.id)}>
            <Check size={16} aria-hidden="true" />
            Mark read
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="g-pane g-card">
        <header>
          <div className="g-row">
            <Shield size={20} aria-hidden="true" />
            <h3>Recent activity</h3>
            {highPriorityCount > 0 && (
              <span className="g-chip g-chip--crit">{highPriorityCount} urgent</span>
            )}
          </div>
          {isExpanded && (
            <button
              className="g-icon-btn"
              onClick={() => setShowFilters(!showFilters)}
              title="Filter alerts by category"
              aria-label="Filter alerts by category"
              aria-pressed={showFilters}
            >
              <Filter size={17} aria-hidden="true" />
            </button>
          )}
        </header>

        {isExpanded && showFilters && (
          <div className="g-tile">
            <div className="g-row g-row--between g-row--wrap">
              <p className="g-label">Filter by category</p>
              {selectedFilters.length > 0 && (
                <button className="g-btn g-btn--ghost" onClick={() => setSelectedFilters([])}>
                  <X size={15} aria-hidden="true" />
                  Clear
                </button>
              )}
            </div>
            <div className="g-row g-row--wrap" style={{ marginTop: 'var(--s-3)' }}>
              {availableCategories.map(category => (
                <button
                  key={category}
                  className={`g-action${selectedFilters.includes(category) ? ' is-ok' : ''}`}
                  onClick={() => toggleFilter(category)}
                  aria-pressed={selectedFilters.includes(category)}
                >
                  <span className="g-row">{getCategoryIcon(category)} {category}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!isExpanded ? (
          <div className="g-stack">
            {unreadAlerts.length === 0 ? (
              <div className="g-empty">
                <strong>No active alerts</strong>
                <p>Everything is quiet right now.</p>
              </div>
            ) : (
              /* The event list from the mockup. Category counters told you
                 how many things happened but never what any of them were —
                 "General 15" is the system describing itself. renderAlertRow
                 already emits the right markup; the compact view just was
                 not using it. */
              <div className="g-list">
                {sortAlertsByPriority(unreadAlerts).slice(0, 6).map(alert => renderAlertRow(alert))}
              </div>
            )}
          </div>
        ) : (
          <div className="g-stack">
            <section className="g-stack g-stack--tight">
              <div className="g-row g-row--between">
                <h4 className="g-label">Unread ({unreadAlerts.length})</h4>
              </div>
              {unreadAlerts.length === 0 ? (
                <div className="g-empty">
                  <strong>No unread alerts</strong>
                  <p>New alerts will appear here.</p>
                </div>
              ) : (
                <div className="g-list">
                  {unreadAlerts.map(alert => renderAlertRow(alert))}
                </div>
              )}
            </section>

            {readAlerts.length > 0 && (
              <section className="g-stack g-stack--tight">
                <h4 className="g-label">Read ({readAlerts.length})</h4>
                <div className="g-list">
                  {paginatedReadAlerts.map(alert => renderAlertRow(alert, true))}
                </div>
                {totalReadPages > 1 && (
                  <div className="g-row g-row--between g-row--wrap">
                    <button
                      className="g-btn g-btn--ghost"
                      onClick={() => setReadAlertsPage(prev => Math.max(1, prev - 1))}
                      disabled={readAlertsPage === 1}
                    >
                      <ChevronLeft size={16} aria-hidden="true" />
                      Previous
                    </button>
                    <span className="g-sub">Page {readAlertsPage} of {totalReadPages}</span>
                    <button
                      className="g-btn g-btn--ghost"
                      onClick={() => setReadAlertsPage(prev => Math.min(totalReadPages, prev + 1))}
                      disabled={readAlertsPage === totalReadPages}
                    >
                      Next
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {popupCategory && (
        <div
          className="g-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="alerts-category-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPopupCategory(null);
          }}
        >
          <div className="g-pane g-modal__card g-modal__card--wide">
            <div className="g-modal__head">
              <div>
                <h2 id="alerts-category-title">{popupCategory}</h2>
                <p>{popupAlerts.length} alert{popupAlerts.length === 1 ? '' : 's'} in this category.</p>
              </div>
              <button className="g-icon-btn" onClick={() => setPopupCategory(null)} aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {popupAlerts.length > 0 ? (
              <div className="g-list">
                {popupAlerts.map(alert => renderAlertRow(alert as ScoredAlert, Boolean(alert.read)))}
              </div>
            ) : (
              <div className="g-empty">
                <strong>No matching alerts</strong>
                <p>This category has cleared.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
