import React, { useEffect, useState } from 'react';
import { Lock, RefreshCw, Unlock, X } from 'lucide-react';
import type { DoorWindow } from '@/types/dashboard';
import { relativeTime } from '@/utils/time';
import { batteryLabel, batteryText } from '@/utils/battery';
import { ModalPortal } from '@/components/glass/ModalPortal';
import { useModalTransition } from '@/components/glass/useModalTransition';
import { ContentSkeleton } from '@/components/glass/Skeleton';
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
  /** Use the wider, flatter composition on the dedicated Access page. */
  pageLayout?: boolean;
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

/* Both of these took the battery alone, so an offline lock drew a full ring
   from whatever it last reported. See utils/battery: only a current reading
   fills the ring. */
function batteryDash(battery: number | undefined, online: boolean) {
  const pct = online && battery != null ? Math.max(0, Math.min(100, battery)) : 0;
  return `${((pct / 100) * RING_CIRCUMFERENCE).toFixed(1)} ${RING_CIRCUMFERENCE}`;
}

function ringClass(battery: number | undefined, online: boolean) {
  if (!online || battery == null) return 'g-ring__fill is-idle';
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

export function DoorCard({ doorsWindows, isExpanded = false, hideHeader = false, pageLayout = false }: DoorCardProps) {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [loadingAll, setLoadingAll] = useState<null | 'lock' | 'unlock'>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [lockStatus, setLockStatus] = useState<DoorLockStatus | null>(null);
  const [fetchingStatus, setFetchingStatus] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; title: string; message: string } | null>(null);
  /* Locking up is one tap. Unlocking asks first — this card sits on the
     home page, where a stray tap should not open the front door. */
  const [pendingUnlock, setPendingUnlock] = useState<DoorWindow | null>(null);

  /* Both dialogs are held on screen for their exit. The status modal
     latches the lock reading too, because closeStatusModal nulls
     selectedDoorId and lockStatus in the same breath. */
  const statusModal = useModalTransition(
    showStatusModal && selectedDoorId ? { doorId: selectedDoorId, status: lockStatus } : null,
  );
  const shownStatus = statusModal.value?.status ?? null;
  const noticeModal = useModalTransition(notice);
  const shownNotice = noticeModal.value;
  const unlockModal = useModalTransition(pendingUnlock);
  const shownUnlock = unlockModal.value;

  useEffect(() => {
    if (!notice && !showStatusModal && !pendingUnlock) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (pendingUnlock) setPendingUnlock(null);
      if (notice) setNotice(null);
      if (showStatusModal) closeStatusModal();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [notice, showStatusModal, pendingUnlock]);

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

  /* The switch on the compact card. It was a status light shaped like a
     control: tabIndex -1, an onClick that only called preventDefault, and
     the click going on to the section behind it — so every tap opened the
     modal instead of moving the lock. */
  const toggleLock = (door: DoorWindow) => {
    if (door.status === 'locked') {
      setPendingUnlock(door);
      return;
    }
    handleLockAction(door.id, 'lock');
  };

  const confirmUnlock = () => {
    if (!shownUnlock) return;
    const door = shownUnlock;
    setPendingUnlock(null);
    handleLockAction(door.id, 'unlock');
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
  const onlineCount = doors.filter(door => door.online).length;

  const DoorStatusTile = ({ door }: { door: DoorWindow }) => {
    const tone = statusTone(door.status);
    const online = door.online ?? false;
    const nextAction = door.status === 'locked' ? 'unlock' : 'lock';

    return (
      <div className={`${pageLayout ? 'access-door-row' : 'g-tile'} ${tone === 'warn' ? 'is-warn' : tone === 'crit' ? 'is-crit' : ''}`}>
        <div className="g-row g-row--between door-tile__identity">
          <div className="g-row">
            <span className={`g-dot g-dot--${online ? tone : 'off'}`} />
            <strong>{door.name}</strong>
            {pageLayout && (
              <span className={statusChipClass(online ? tone : 'idle')}>
                {online ? statusCopy(door.status) : 'Offline'}
              </span>
            )}
          </div>
          <svg className="g-ring" viewBox="0 0 24 24" role="img" aria-label={batteryLabel(door.name, door.battery, online)}>
            <circle className="g-ring__track" cx="12" cy="12" r="9" />
            <circle
              className={ringClass(door.battery, online)}
              cx="12"
              cy="12"
              r="9"
              strokeDasharray={batteryDash(door.battery, online)}
              transform="rotate(-90 12 12)"
            />
          </svg>
        </div>

        <div className="g-row g-row--between door-tile__state">
          {!pageLayout && <span className={statusChipClass(online ? tone : 'idle')}>{online ? statusCopy(door.status) : 'Offline'}</span>}
          {/* "0%" for a lock that never reported a battery read as flat. */}
          <span className={online && door.battery != null ? 'g-num' : 'g-dim'}>
            {pageLayout ? `Battery ${batteryText(door.battery, online).toLowerCase()}` : batteryText(door.battery, online)}
          </span>
        </div>

        <p className="g-sub door-tile__meta">{door.location} · changed {formatTimestamp(door.last_changed)}</p>

        <div className="g-row g-row--wrap door-tile__actions">
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
              /* The status has not flipped yet while the command is in
                 flight, so the action under way is the one it is not in. */
              const busy = loadingStates[door.id] ?? false;
              const action = door.status === 'locked' ? 'unlock' : 'lock';

              return (
                <div key={door.id} className="g-row g-row--between">
                  <div>
                    <div className="g-row">
                      <i className={`g-dot g-dot--${online ? tone : 'off'}`} />
                      <strong>{door.name}</strong>
                    </div>
                    <p className="g-sub">
                      {busy
                        ? `${action === 'lock' ? 'Locking' : 'Unlocking'}…`
                        : online
                          ? `${statusCopy(door.status)} since ${formatTimestamp(door.last_changed)}`
                          : `Not reporting · last ${statusCopy(door.status).toLowerCase()} ${formatTimestamp(door.last_changed)}`}
                    </p>
                  </div>
                  <button
                    className="g-switch"
                    type="button"
                    disabled={!online || busy}
                    aria-pressed={door.status === 'locked'}
                    aria-busy={busy}
                    aria-label={online ? `${statusCopy(action)} ${door.name}` : `${door.name} is not reporting`}
                    /* The card behind this is itself a button that opens the
                       Doors modal. Without this the lock would move and the
                       modal would open on the same tap. */
                    onClick={(event) => { event.stopPropagation(); toggleLock(door); }}
                    onKeyDown={(event) => event.stopPropagation()}
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
          {pageLayout ? (
            <div className={`access-door-overview ${unlockedCount ? 'is-warn' : ''}`}>
              <div className="access-door-overview__copy">
                <span className={`g-dot g-dot--${unlockedCount ? 'warn' : onlineCount ? 'ok' : 'off'}`} aria-hidden="true" />
                <div>
                  <strong>{doors.length === 0 ? 'No locks are paired' : unlockedCount ? `${unlockedCount} ${unlockedCount === 1 ? 'door needs' : 'doors need'} securing` : 'Everything is secured'}</strong>
                  <p>{doors.length ? `${onlineCount} of ${doors.length} ${doors.length === 1 ? 'lock is' : 'locks are'} reporting.` : 'Paired door locks will appear here.'}</p>
                </div>
              </div>
              <div className="g-row g-row--wrap access-door-overview__actions">
                <button className={unlockedCount ? 'g-btn g-btn--primary' : 'g-btn g-btn--ghost'} type="button" onClick={handleLockAll} disabled={loadingAll !== null || unlockedCount === 0}>
                  <Lock size={16} aria-hidden="true" />
                  {loadingAll === 'lock' ? 'Locking all' : 'Lock all'}
                </button>
                <button className="g-btn g-btn--ghost" type="button" onClick={handleUnlockAll} disabled={loadingAll !== null || doors.length === 0}>
                  <Unlock size={16} aria-hidden="true" />
                  {loadingAll === 'unlock' ? 'Unlocking all' : 'Unlock all'}
                </button>
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}

          {/* auto-fit rather than a fixed 2. With one lock enrolled a hard
              two-column grid left half the row empty, and a full-width
              stretch put the name and the battery ring 900px apart. The
              tiles flow and stop growing at 460px. */}
          <div className={pageLayout ? 'access-door-list' : 'g-grid g-grid--tiles'}>
            {doors.map(door => <DoorStatusTile key={door.id} door={door} />)}
          </div>
        </div>
      )}

      {statusModal.render && (
        <ModalPortal>
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
                <ContentSkeleton label="Loading lock status." rows={2} tiles={3} />
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
                      aria-busy={fetchingStatus}
                    >
                      <RefreshCw size={16} aria-hidden="true" />
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
        </ModalPortal>
      )}

      {unlockModal.render && shownUnlock && (
        <ModalPortal>
          <div className={unlockModal.className} role="dialog" aria-modal="true" aria-labelledby="door-unlock-title" onClick={() => setPendingUnlock(null)}>
            <div className="g-pane g-modal__card" onClick={(event) => event.stopPropagation()}>
              <div className="g-modal__head">
                <div>
                  <h2 id="door-unlock-title">Unlock the {shownUnlock.name.toLowerCase()}?</h2>
                  <p>It stays unlocked until you lock it again or someone locks it at the door.</p>
                </div>
                <button className="g-icon-btn" type="button" aria-label="Close" onClick={() => setPendingUnlock(null)}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="g-modal__foot">
                <button className="g-btn g-btn--ghost" type="button" onClick={() => setPendingUnlock(null)}>
                  Keep it locked
                </button>
                <button className="g-btn g-btn--danger" type="button" onClick={confirmUnlock}>
                  <Unlock size={16} aria-hidden="true" />
                  Unlock
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {noticeModal.render && shownNotice && (
        <ModalPortal>
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
        </ModalPortal>
      )}
    </>
  );
}
