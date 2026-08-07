import React, { useEffect, useState } from 'react';
import { Lock, RefreshCw, Unlock, X } from 'lucide-react';
import type { DoorWindow } from '@/types/dashboard';
import { relativeTime } from '@/utils/time';
import { useModalTransition } from '@/components/glass/useModalTransition';
import {
  sendCommand,
  getLockStatus,
  lockAllDoors,
  unlockAllDoors,
  type DoorLockStatus,
} from '@/services/devices.service';

interface DoorCardProps {
  doorsWindows: DoorWindow[];
  isExpanded?: boolean;
  /* Set by the dashboard modal, which names the card itself. /access keeps
     the header — there the card is one section among several. */
  hideHeader?: boolean;
}

type NoticeTone = 'warn' | 'crit';

const RING_CIRCUMFERENCE = 56.5;

function statusTone(status: DoorWindow['status']) {
  if (status === 'locked' || status === 'closed') return 'ok';
  if (status === 'unlocked') return 'warn';
  return 'crit';
}

function statusCopy(status: DoorWindow['status'] | 'lock' | 'unlock') {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatTimestamp(timestamp: string | null | undefined) {
  if (!timestamp) return 'Not reported';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Not reported';
  return relativeTime(date);
}

function formatUptime(ms: number | null | undefined) {
  if (ms == null) return 'N/A';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

function batteryDash(battery?: number) {
  const pct = Math.max(0, Math.min(100, battery ?? 0));
  return `${((pct / 100) * RING_CIRCUMFERENCE).toFixed(1)} ${RING_CIRCUMFERENCE}`;
}

function ringClass(battery?: number) {
  if (battery == null) return 'g-ring__fill is-idle';
  if (battery <= 20) return 'g-ring__fill is-crit';
  if (battery <= 40) return 'g-ring__fill is-warn';
  return 'g-ring__fill';
}

function statusChipClass(tone: string) {
  if (tone === 'ok') return 'g-chip g-chip--ok';
  if (tone === 'warn') return 'g-chip g-chip--warn';
  if (tone === 'crit') return 'g-chip g-chip--crit';
  return 'g-chip';
}

export function DoorCard({ doorsWindows, isExpanded = false, hideHeader = false }: DoorCardProps) {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [loadingAll, setLoadingAll] = useState<null | 'lock' | 'unlock'>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [lockStatus, setLockStatus] = useState<DoorLockStatus | null>(null);
  const [fetchingStatus, setFetchingStatus] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; title: string; message: string } | null>(null);

  /* Both dialogs are held on screen for their exit. The status modal
     latches the lock reading too, because closeStatusModal nulls
     selectedDoorId and lockStatus in the same breath. */
  const statusModal = useModalTransition(
    showStatusModal && selectedDoorId ? { doorId: selectedDoorId, status: lockStatus } : null,
  );
  const shownStatus = statusModal.value?.status ?? null;
  const noticeModal = useModalTransition(notice);
  const shownNotice = noticeModal.value;

  useEffect(() => {
    if (!notice && !showStatusModal) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (notice) setNotice(null);
      if (showStatusModal) closeStatusModal();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [notice, showStatusModal]);

  const showNotice = (tone: NoticeTone, title: string, message: string) => {
    setNotice({ tone, title, message });
  };

  const handleLockAction = async (doorId: string, action: 'lock' | 'unlock') => {
    try {
      setLoadingStates(prev => ({ ...prev, [doorId]: true }));

      const result = await sendCommand(doorId, action, { timeout: 5000 });

      if (result && result.status === 'ok') {
        console.log(`${action} command sent successfully:`, result);

        const expectedState = action === 'lock' ? 'locked' : 'unlocked';
        const startTime = Date.now();
        const maxWaitTime = 20000;
        const pollInterval = 1000;

        const checkStatus = async (): Promise<boolean> => {
          try {
            const status = await getLockStatus(doorId);
            if (status && status.lock_state === expectedState) {
              return true;
            }

            if (Date.now() - startTime > maxWaitTime) {
              console.log(`Timeout waiting for ${action} state change`);
              return false;
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
            return checkStatus();
          } catch (error) {
            console.error('Error checking lock status:', error);
            return false;
          }
        };

        await checkStatus();
      } else {
        showNotice('crit', `Could not ${action} the door`, 'Check that the lock is online, then try again.');
      }
    } catch (error) {
      console.error(`Error sending ${action} command:`, error);
      showNotice('crit', `Could not ${action} the door`, 'Check that the lock is online, then try again.');
    } finally {
      setLoadingStates(prev => ({ ...prev, [doorId]: false }));
    }
  };

  const handleLockAll = async () => {
    setLoadingAll('lock');
    try {
      await lockAllDoors();
    } catch (error) {
      console.error('Failed to lock all doors', error);
      showNotice('warn', 'Some doors did not lock', 'Check each lock status before leaving the house.');
    } finally {
      setLoadingAll(null);
    }
  };

  const handleUnlockAll = async () => {
    setLoadingAll('unlock');
    try {
      await unlockAllDoors();
    } catch (error) {
      console.error('Failed to unlock all doors', error);
      showNotice('warn', 'Some doors did not unlock', 'Check each lock status and retry the unlock command.');
    } finally {
      setLoadingAll(null);
    }
  };

  const fetchLockStatus = async (doorId: string) => {
    try {
      setFetchingStatus(true);
      const status = await getLockStatus(doorId);
      setLockStatus(status);
    } catch (error) {
      console.error('Error fetching lock status:', error);
      showNotice('crit', 'Status did not load', 'Check that the lock is online, then refresh status again.');
    } finally {
      setFetchingStatus(false);
    }
  };

  const openStatusModal = async (doorId: string) => {
    setSelectedDoorId(doorId);
    setShowStatusModal(true);
    await fetchLockStatus(doorId);
  };

  const closeStatusModal = () => {
    setShowStatusModal(false);
    setSelectedDoorId(null);
    setLockStatus(null);
  };

  const doors = doorsWindows.filter(item => item.type === 'door');
  const unlockedCount = doors.filter(door => door.status !== 'locked').length;

  const DoorStatusTile = ({ door }: { door: DoorWindow }) => {
    const tone = statusTone(door.status);
    const online = door.online ?? false;
    const nextAction = door.status === 'locked' ? 'unlock' : 'lock';

    return (
      <div className={`g-tile ${tone === 'warn' ? 'is-warn' : tone === 'crit' ? 'is-crit' : ''}`}>
        <div className="g-row g-row--between">
          <div className="g-row">
            <span className={`g-dot g-dot--${online ? tone : 'off'}`} />
            <strong>{door.name}</strong>
          </div>
          <svg className="g-ring" viewBox="0 0 24 24" aria-label={`${door.name} battery ${door.battery ?? 0} percent`}>
            <circle className="g-ring__track" cx="12" cy="12" r="9" />
            <circle
              className={ringClass(door.battery)}
              cx="12"
              cy="12"
              r="9"
              strokeDasharray={batteryDash(door.battery)}
              transform="rotate(-90 12 12)"
            />
          </svg>
        </div>

        <div className="g-row g-row--between" style={{ marginTop: 'var(--s-3)' }}>
          <span className={statusChipClass(online ? tone : 'idle')}>{online ? statusCopy(door.status) : 'Offline'}</span>
          <span className="g-num">{door.battery ?? 0}%</span>
        </div>

        <p className="g-sub">{door.location} · changed {formatTimestamp(door.last_changed)}</p>

        <div className="g-row g-row--wrap" style={{ marginTop: 'var(--s-4)' }}>
          <button
            className={nextAction === 'lock' ? 'g-btn g-btn--primary' : 'g-btn g-btn--ghost'}
            type="button"
            onClick={() => handleLockAction(door.id, nextAction)}
            disabled={loadingStates[door.id] || !online}
          >
            {nextAction === 'lock' ? <Lock size={16} aria-hidden="true" /> : <Unlock size={16} aria-hidden="true" />}
            {loadingStates[door.id] ? `${nextAction === 'lock' ? 'Locking' : 'Unlocking'}` : online ? statusCopy(nextAction) : 'Offline'}
          </button>
          <button className="g-btn g-btn--ghost" type="button" onClick={() => openStatusModal(door.id)}>
            <RefreshCw size={16} aria-hidden="true" />
            Status
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {!hideHeader && (
        <header>
          <h2>Doors</h2>
          <span className={`g-label ${unlockedCount ? 'is-warn' : ''}`}>
            {doors.length} {doors.length === 1 ? 'lock' : 'locks'}
          </span>
        </header>
      )}

      {!isExpanded ? (
        doors.length ? (
          <div className="g-divided">
            {doors.slice(0, 3).map(door => {
              const tone = statusTone(door.status);

              /* An offline lock has no current state — only the last one we
                 were told. The expanded view already said so; the compact
                 one asserted "Unlocked since Dec 8" for a board that has
                 been silent since March, while the stat strip above it
                 said "Not reporting". */
              const online = door.online ?? false;

              return (
                <div key={door.id} className="g-row g-row--between">
                  <div>
                    <div className="g-row">
                      <i className={`g-dot g-dot--${online ? tone : 'off'}`} />
                      <strong>{door.name}</strong>
                    </div>
                    <p className="g-sub">
                      {online
                        ? `${statusCopy(door.status)} since ${formatTimestamp(door.last_changed)}`
                        : `Not reporting · last ${statusCopy(door.status).toLowerCase()} ${formatTimestamp(door.last_changed)}`}
                    </p>
                  </div>
                  <button
                    className="g-switch"
                    type="button"
                    disabled={!online}
                    aria-pressed={door.status === 'locked'}
                    aria-label={`${door.name} lock state`}
                    tabIndex={-1}
                    onClick={(event) => event.preventDefault()}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="g-empty">
            <strong>No door locks</strong>
            <p>No lock devices have reported yet.</p>
          </div>
        )
      ) : (
        <div className="g-stack">
          <div className="dash-modal-grid dash-modal-grid--2">
            <div className="g-tile">
              <p className="g-label">Doors</p>
              <div className="g-metric-sm g-num">{doors.length}</div>
            </div>
            <div className={unlockedCount ? 'g-tile is-warn' : 'g-tile'}>
              <p className="g-label">Unlocked or open</p>
              <div className="g-metric-sm g-num">{unlockedCount}</div>
            </div>
          </div>

          <div className="g-row g-row--wrap">
            <button className="g-btn g-btn--primary" type="button" onClick={handleLockAll} disabled={loadingAll !== null}>
              <Lock size={16} aria-hidden="true" />
              {loadingAll === 'lock' ? 'Locking all' : 'Lock all'}
            </button>
            <button className="g-btn g-btn--ghost" type="button" onClick={handleUnlockAll} disabled={loadingAll !== null}>
              <Unlock size={16} aria-hidden="true" />
              {loadingAll === 'unlock' ? 'Unlocking all' : 'Unlock all'}
            </button>
          </div>

          {/* auto-fit rather than a fixed 2. With one lock enrolled a hard
              two-column grid left half the row empty, and a full-width
              stretch put the name and the battery ring 900px apart. The
              tiles flow and stop growing at 460px. */}
          <div className="g-grid g-grid--tiles">
            {doors.map(door => <DoorStatusTile key={door.id} door={door} />)}
          </div>
        </div>
      )}

      {statusModal.render && (
        <div className={statusModal.className} role="dialog" aria-modal="true" aria-labelledby="door-status-title" onClick={closeStatusModal}>
          <div className="g-pane g-modal__card g-modal__card--wide" onClick={(event) => event.stopPropagation()}>
            <div className="g-modal__head">
              <div>
                <h2 id="door-status-title">Door lock status</h2>
                <p>Live lock state, heartbeat, and pending commands for the selected door.</p>
              </div>
              <button className="g-icon-btn" type="button" aria-label="Close" onClick={closeStatusModal}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {fetchingStatus && !shownStatus ? (
              <div className="g-empty">
                <RefreshCw size={32} className="spinning" aria-hidden="true" />
                <strong>Loading lock status</strong>
                <p>Waiting for the lock to report back.</p>
              </div>
            ) : shownStatus ? (
              <div className="g-stack">
                <div className="dash-modal-grid">
                  <div className="g-tile">
                    <p className="g-label">Lock state</p>
                    <div className={`g-metric-sm g-num ${shownStatus.lock_state === 'locked' ? 'is-ok' : 'is-warn'}`}>
                      {shownStatus.lock_state}
                    </div>
                  </div>
                  <div className={shownStatus.online ? 'g-tile' : 'g-tile is-warn'}>
                    <p className="g-label">Online</p>
                    <div className="g-metric-sm g-num">{shownStatus.online ? 'Yes' : 'No'}</div>
                  </div>
                  <div className={shownStatus.has_pending_commands ? 'g-tile is-warn' : 'g-tile'}>
                    <p className="g-label">Pending</p>
                    <div className="g-metric-sm g-num">{shownStatus.pending_commands.length}</div>
                  </div>
                </div>

                <dl className="g-info">
                  <div><dt>Device ID</dt><dd>{shownStatus.device_id}</dd></div>
                  <div><dt>Device name</dt><dd>{shownStatus.device_name}</dd></div>
                  <div><dt>Last action</dt><dd>{shownStatus.last_action}</dd></div>
                  <div><dt>Last action time</dt><dd>{formatTimestamp(shownStatus.last_action_time)}</dd></div>
                  <div><dt>Last heartbeat</dt><dd>{formatTimestamp(shownStatus.last_heartbeat)}</dd></div>
                  <div><dt>Wi-Fi signal</dt><dd>{shownStatus.wifi_rssi !== null ? `${shownStatus.wifi_rssi} dBm` : 'N/A'}</dd></div>
                  <div><dt>Uptime</dt><dd>{formatUptime(shownStatus.uptime_ms)}</dd></div>
                </dl>

                {shownStatus.has_pending_commands && shownStatus.pending_commands.length > 0 && (
                  <div className="g-log">
                    {shownStatus.pending_commands.map((cmd: { action?: string }, idx: number) => (
                      <div key={`${cmd.action || 'pending'}-${idx}`}>{cmd.action || 'Unknown action'}</div>
                    ))}
                  </div>
                )}

                <div className="g-modal__foot">
                  <button
                    className="g-btn g-btn--ghost"
                    type="button"
                    onClick={() => statusModal.value && fetchLockStatus(statusModal.value.doorId)}
                    disabled={fetchingStatus}
                  >
                    <RefreshCw size={16} className={fetchingStatus ? 'spinning' : ''} aria-hidden="true" />
                    Refresh
                  </button>
                </div>
              </div>
            ) : (
              <div className="g-empty">
                <strong>Status did not load</strong>
                <p>Check that the lock is online, then refresh status again.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {noticeModal.render && shownNotice && (
        <div className={noticeModal.className} role="dialog" aria-modal="true" aria-labelledby="door-notice-title" onClick={() => setNotice(null)}>
          <div className="g-pane g-modal__card" onClick={(event) => event.stopPropagation()}>
            <div className="g-modal__head">
              <div>
                <h2 id="door-notice-title">{shownNotice.title}</h2>
                <p>{shownNotice.message}</p>
              </div>
              <button className="g-icon-btn" type="button" aria-label="Close" onClick={() => setNotice(null)}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="g-modal__foot">
              <button className={shownNotice.tone === 'crit' ? 'g-btn g-btn--danger' : 'g-btn g-btn--primary'} type="button" onClick={() => setNotice(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
