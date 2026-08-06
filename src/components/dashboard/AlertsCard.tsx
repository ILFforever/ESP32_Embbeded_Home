import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Battery,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
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
import { markAlertAsRead, markMultipleAlertsAsRead } from '@/services/devices.service';
import { URGENT_SCORE, getAlertPriorityCategory, sortAlertsByPriority, type ScoredAlert } from '@/utils/alertScoring';
import { alertTags, getAlertTitle } from '@/utils/alertText';
import { labelForId } from '@/utils/deviceNames';
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
  const [readAlertsPage, setReadAlertsPage] = useState(1);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const readAlertsPerPage = 5;

  /* There was a category drill-down modal here. It became unreachable when
     the compact view swapped its category-counter grid for the plain event
     list: the counters were the only thing that opened it, so the state,
     the Escape handler and ~30 lines of dialog markup were all live code
     nothing could reach. The expanded view's filter chips already narrow
     to one category, which is what the drill-down did. */

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

  /* Every alert, sorted. This used to keep only the first three unread
     unknown-face alerts and drop the rest *from the set*, not from the
     view — so the expanded list, the filters and the urgent count were all
     computed over a subset. That is why the card said "11 urgent" while
     the dashboard said 37: 26 unknown-face alerts had been thrown away
     before anything was counted.
     Capping the flood is a display concern, so it now happens where the
     compact list is built and nowhere else. */
  const sortedAlerts = useMemo(() => sortAlertsByPriority(alerts), [alerts]);

  const filteredAlerts = useMemo(() => {
    if (selectedFilters.length === 0) return sortedAlerts;
    return sortedAlerts.filter(alert => selectedFilters.includes(getAlertCategory(alert)));
  }, [sortedAlerts, selectedFilters]);

  const unreadAlerts = filteredAlerts.filter(a => !a.read);
  const unreadActionAlerts = unreadAlerts.filter(a => a.level !== 'INFO');
  const unreadInfoAlerts = unreadAlerts.filter(a => a.level === 'INFO');
  const readAlerts = filteredAlerts.filter(a => a.read);
  const allUnreadAlerts = sortedAlerts.filter(a => !a.read);

  /* Ten rows for the home page, at most three about unknown faces — a busy
     doorbell will otherwise fill the card with one repeated event and hide
     everything else. Ten because this card now spans the full height of
     the bento grid; at six it ended half empty.
     This narrows what is shown, never what is counted. */
  const compactAlerts = useMemo(() => {
    let unknownFaces = 0;
    const rows: ScoredAlert[] = [];

    for (const alert of unreadActionAlerts) {
      const tags = alertTags(alert);
      if (tags.includes('face-detection') && tags.includes('unknown')) {
        if (unknownFaces >= 3) continue;
        unknownFaces += 1;
      }
      rows.push(alert);
      if (rows.length === 10) break;
    }
    return rows;
  }, [unreadActionAlerts]);
  /* URGENT_SCORE, not a literal 50. The dashboard hero used to count
     level === 'IMPORTANT' while this counted score >= 50, so the same
     screen said "none urgent" and "11 urgent" at once. */
  const highPriorityCount = sortedAlerts.filter(a => !a.read && a.score >= URGENT_SCORE).length;

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

  const totalReadPages = Math.ceil(readAlerts.length / readAlertsPerPage);
  const startIndex = (readAlertsPage - 1) * readAlertsPerPage;
  const paginatedReadAlerts = readAlerts.slice(startIndex, startIndex + readAlertsPerPage);

  const handleMarkAsRead = async (alertId: string) => {
    const success = await markAlertAsRead(alertId);
    if (success && onRefresh) onRefresh();
  };

  const handleMarkAllAsRead = async () => {
    if (allUnreadAlerts.length === 0 || isMarkingAllRead) return;

    setIsMarkingAllRead(true);
    try {
      const success = await markMultipleAlertsAsRead(allUnreadAlerts.map(alert => alert.id));
      if (success) {
        setReadAlertsPage(1);
        await onRefresh?.();
      }
    } finally {
      setIsMarkingAllRead(false);
    }
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
        <span>{relativeTime(alert.timestamp)} · {labelForId(alert.source)}</span>
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
            <>
              {compactAlerts.length > 0 ? (
                <div className="g-list">
                  {compactAlerts.map(alert => renderAlertRow(alert))}
                </div>
              ) : (
                <div className="g-empty">
                  <strong>No alerts need attention</strong>
                  <p>{unreadInfoAlerts.length} routine update{unreadInfoAlerts.length === 1 ? '' : 's'} available.</p>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="g-stack">
          <section className="g-stack g-stack--tight">
            <div className="g-row g-row--between">
              <h4 className="g-label">Unread ({unreadAlerts.length})</h4>
              {allUnreadAlerts.length > 0 && (
                <button
                  className="g-btn g-btn--ghost"
                  type="button"
                  onClick={handleMarkAllAsRead}
                  disabled={isMarkingAllRead}
                  title={`Mark all ${allUnreadAlerts.length} unread alerts as read`}
                >
                  <CheckCheck size={16} aria-hidden="true" />
                  {isMarkingAllRead ? 'Marking read…' : 'Read all'}
                </button>
              )}
            </div>
            {unreadAlerts.length === 0 ? (
              <div className="g-empty">
                <strong>No unread alerts</strong>
                <p>New alerts will appear here.</p>
              </div>
            ) : (
              <div className="g-stack g-stack--tight">
                {unreadActionAlerts.length > 0 && (
                  <div className="g-list">
                    {unreadActionAlerts.map(alert => renderAlertRow(alert))}
                  </div>
                )}

                {unreadInfoAlerts.length > 0 && (
                  <details className="g-alerts__info">
                    <summary className="g-action">
                      <span>
                        Information
                        <small>{unreadInfoAlerts.length} routine update{unreadInfoAlerts.length === 1 ? '' : 's'}</small>
                      </span>
                      <ChevronDown size={17} aria-hidden="true" />
                    </summary>
                    <div className="g-list">
                      {unreadInfoAlerts.map(alert => renderAlertRow(alert))}
                    </div>
                  </details>
                )}
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
  );
}
