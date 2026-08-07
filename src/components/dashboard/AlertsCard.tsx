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
  /* See TemperatureCard: inside the modal the surrounding card supplies the
     pane and the title, so the header only repeats them. What the modal head
     cannot carry — the urgent count and the way into the categories — moves
     into a control row instead of disappearing with it. */
  hideHeader?: boolean;
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

/* The third line of every row used to restate the first: "Unknown person
   at the door" with "Unknown person detected at door" beneath it. Exact
   comparison does not catch that — the wording differs by one word — so
   compare the words themselves and drop the message when it is mostly the
   title again. A message that genuinely adds something (a reading, a
   reason, a device string) shares few words and still shows. */
const wordsOf = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
const detailMessage = (alert: Alert): string | null => {
  let message = alert.message?.trim();
  if (!message) return null;
  /* Board messages arrive prefixed with their own device id — "db_001:
     Command 'amp_stop' completed". The line beneath already names the
     device in words ("Hall doorbell"), and those two extra tokens were
     enough to drag the overlap under the threshold and keep the whole
     duplicate line on screen. */
  const prefix = `${alert.source}:`;
  if (message.startsWith(prefix)) message = message.slice(prefix.length).trim();
  if (!message) return null;
  const inTitle = wordsOf(getAlertTitle(alert));
  const inMessage = wordsOf(message);
  if (inMessage.size === 0) return null;
  let shared = 0;
  inMessage.forEach(word => { if (inTitle.has(word)) shared += 1; });
  return shared / inMessage.size < 0.7 ? message : null;
};

/* One doorbell can put the same sentence on screen fifty times. Identical
   events — same title, same device, same priority — collapse to a single
   row carrying a count and the most recent time, so the list shows what
   happened rather than how many times it was written down. Priority is
   part of the key: the four alerts scored critical are a different fact
   from the three scored high, even with the same wording. */
type AlertGroup = { lead: ScoredAlert; ids: string[]; count: number; latest: string };

const groupAlerts = (list: ScoredAlert[]): AlertGroup[] => {
  const groups = new Map<string, AlertGroup>();
  for (const alert of list) {
    const key = `${getAlertTitle(alert)}|${alert.source}|${getAlertPriorityCategory(alert.score)}`;
    const found = groups.get(key);
    if (found) {
      found.ids.push(alert.id);
      found.count += 1;
      if (Date.parse(alert.timestamp) > Date.parse(found.latest)) found.latest = alert.timestamp;
    } else {
      /* Insertion order is priority order, because the list arrives
         sorted — so the grouped list keeps the same ranking. */
      groups.set(key, { lead: alert, ids: [alert.id], count: 1, latest: alert.timestamp });
    }
  }
  return Array.from(groups.values());
};


export function AlertsCard({ alerts, isExpanded = false, hideHeader = false, onRefresh }: AlertsCardProps) {
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
        return <Users size={15} aria-hidden="true" />;
      case 'Motion':
        return <Move size={15} aria-hidden="true" />;
      case 'Doorbell':
        return <Bell size={15} aria-hidden="true" />;
      case 'Device status':
        return <HardDrive size={15} aria-hidden="true" />;
      case 'Board errors':
        return <ToyBrick size={15} aria-hidden="true" />;
      case 'Security':
        return <KeyRound size={15} aria-hidden="true" />;
      case 'Door locks':
        return <Lock size={15} aria-hidden="true" />;
      case 'Access control':
        return <DoorOpen size={15} aria-hidden="true" />;
      case 'Safety':
        return <Siren size={15} aria-hidden="true" />;
      case 'Temperature':
        return <Thermometer size={15} aria-hidden="true" />;
      case 'Humidity':
        return <Droplets size={15} aria-hidden="true" />;
      case 'Air quality':
        return <Wind size={15} aria-hidden="true" />;
      case 'Battery':
        return <Battery size={15} aria-hidden="true" />;
      case 'Network':
        return <Wifi size={15} aria-hidden="true" />;
      case 'System':
        return <Computer size={15} aria-hidden="true" />;
      default:
        return <AlertCircle size={15} aria-hidden="true" />;
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

  /* With a count each. A filter list without them is a blind click: four
     equal-looking buttons over 150 alerts, none of them saying which one
     holds the flood.

     Biggest bucket first, too. Alphabetical with 'General' pinned to the
     front put the arbitrary catch-all ahead of the category you are
     almost certainly looking for. */
  const availableCategories = useMemo(() => {
    const counts = new Map<string, number>();
    sortedAlerts.forEach(alert => {
      const category = getAlertCategory(alert);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    });
    return Array.from(counts, ([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [sortedAlerts]);

  /* Grouped before paging, so a page is five distinct events rather than
     five copies of one. */
  const unreadActionGroups = groupAlerts(unreadActionAlerts);
  const unreadInfoGroups = groupAlerts(unreadInfoAlerts);
  const readGroups = groupAlerts(readAlerts);
  const totalReadPages = Math.ceil(readGroups.length / readAlertsPerPage);
  const startIndex = (readAlertsPage - 1) * readAlertsPerPage;
  const paginatedReadGroups = readGroups.slice(startIndex, startIndex + readAlertsPerPage);

  const handleMarkGroupAsRead = async (group: AlertGroup) => {
    const success = group.count === 1
      ? await markAlertAsRead(group.ids[0])
      : await markMultipleAlertsAsRead(group.ids);
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

  const renderAlertGroup = (group: AlertGroup, read = false) => {
    const alert = group.lead;
    const category = getAlertPriorityCategory(alert.score);
    /* Every expanded row used to carry two coloured pills for one event:
       the device's level ("warn") beside the computed priority
       ("critical"). Two vocabularies for the same alert, and the dot at
       the head of the row is already the level. Keep one pill, and only
       when it says something — a "low" badge on all 150 rows is noise. */
    const showPriority = isExpanded && (category === 'critical' || category === 'high');
    const detail = detailMessage(alert);

    return (
      <div key={alert.id} className={`g-list__row${!read && isExpanded ? ' g-list__row--act' : ''}`}>
        <i className={levelDotClass(alert.level)} />
        <p>
          {getAlertTitle(alert)}
          {group.count > 1 && <b className="g-list__count">{group.count}×</b>}
          <span>{relativeTime(group.latest)} · {labelForId(alert.source)}</span>
          {isExpanded && detail && <span>{detail}</span>}
          {isExpanded && alert.metadata?.confidence !== undefined && alert.metadata.confidence > 0 && (
            <span>Confidence {(alert.metadata.confidence * 100).toFixed(1)}%</span>
          )}
        </p>
        <div className="g-row">
          {!isExpanded && <span className={levelChipClass(alert.level)}>{alert.level.toLowerCase()}</span>}
          {showPriority && renderPriorityBadge(alert)}
          {/* Icon, and only under the pointer. A labelled pill on every
              row made the least important control the loudest thing in
              the list; the row it belongs to is enough of a label. It
              stays reachable by keyboard — focus-visible reveals it. */}
          {!read && isExpanded && (
            <button
              className="g-icon-btn g-list__act"
              onClick={() => handleMarkGroupAsRead(group)}
              title={group.count > 1 ? `Mark all ${group.count} as read` : 'Mark as read'}
              aria-label={group.count > 1 ? `Mark all ${group.count} as read` : 'Mark as read'}
            >
              <Check size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderAlertRow = (alert: ScoredAlert, read = false) =>
    renderAlertGroup({ lead: alert, ids: [alert.id], count: 1, latest: alert.timestamp }, read);

  return (
    <div className={hideHeader ? 'g-stack' : 'g-pane g-card'}>
      {!hideHeader ? (
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
      ) : (
        /* One control row, not three. This was a chip on its own line,
           then a "Unread (150)" heading with "Read all" on another, then
           the list — three bands of chrome before a single event. The
           counts are two numbers, so they read as one sentence, and both
           buttons sit together on the right.

           Labelled, not icon-only: in the modal there is room to say what
           the button does, and the compact card's icon vocabulary is what
           made two refresh controls easy to miss in the first place. */
        <div className="g-row g-row--between g-row--wrap">
          <div className="g-row">
            {highPriorityCount > 0 ? (
              <span className="g-chip g-chip--crit">{highPriorityCount} urgent</span>
            ) : (
              <span className="g-chip">Nothing urgent</span>
            )}
            <span className="g-sub">{unreadAlerts.length} unread</span>
          </div>
          <div className="g-row">
            <button
              className="g-btn g-btn--ghost"
              onClick={() => setShowFilters(!showFilters)}
              aria-pressed={showFilters}
            >
              <Filter size={16} aria-hidden="true" />
              Filter
            </button>
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
        </div>
      )}

      {/* A row of toggles, not a panel. This was a nested tile headed
          "FILTER BY CATEGORY" — a surface and a title explaining the
          button you had just pressed to open it — wrapping four bordered
          boxes that looked like primary actions rather than switches.

          The selected state is real now: `g-action is-ok` was a class
          with no rule anywhere behind it, so choosing a category changed
          nothing on screen. */}
      {isExpanded && showFilters && (
        <div className="g-filters">
          {availableCategories.map(({ name, count }) => {
            const active = selectedFilters.includes(name);
            return (
              <button
                key={name}
                className="g-filter"
                onClick={() => toggleFilter(name)}
                aria-pressed={active}
              >
                {getCategoryIcon(name)}
                {name}
                <small>{count}</small>
              </button>
            );
          })}
          {selectedFilters.length > 0 && (
            <button className="g-filter g-filter--clear" onClick={() => setSelectedFilters([])}>
              <X size={15} aria-hidden="true" />
              Clear
            </button>
          )}
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
          {/* No "Unread (150)" heading — the count and Read all moved up
              into the control row, and with nothing else above the list
              the first thing in the panel is now an actual event. */}
          <section className="g-stack g-stack--tight">
            {unreadAlerts.length === 0 ? (
              <div className="g-empty">
                <strong>No unread alerts</strong>
                <p>New alerts will appear here.</p>
              </div>
            ) : (
              <div className="g-stack g-stack--tight">
                {unreadActionGroups.length > 0 && (
                  <div className="g-list">
                    {unreadActionGroups.map(group => renderAlertGroup(group))}
                  </div>
                )}

                {unreadInfoGroups.length > 0 && (
                  <details className="g-alerts__info">
                    <summary className="g-action">
                      <span>
                        Information
                        <small>{unreadInfoAlerts.length} routine update{unreadInfoAlerts.length === 1 ? '' : 's'}</small>
                      </span>
                      <ChevronDown size={17} aria-hidden="true" />
                    </summary>
                    <div className="g-list">
                      {unreadInfoGroups.map(group => renderAlertGroup(group))}
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
                {paginatedReadGroups.map(group => renderAlertGroup(group, true))}
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
