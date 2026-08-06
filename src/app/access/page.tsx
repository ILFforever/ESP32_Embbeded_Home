'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import GlassBar from '@/components/glass/GlassBar';
import { DoorCard } from '@/components/dashboard/DoorCard';
import { NfcManagementCard } from '@/components/dashboard/NfcManagementCard';
import { getAlerts, getAllDevices, getLockStatus } from '@/services/devices.service';
import type { Alert, DevicesStatus, DoorWindow } from '@/types/dashboard';
import { alertLevelToType } from '@/types/dashboard';
import { alertTags, getAlertTitle } from '@/utils/alertText';
import { relativeTime } from '@/utils/time';

/**
 * Access & cards — mockups/glass/access.html as a real route.
 *
 * This content existed only as a dashboard modal reached via ?card=doors,
 * so the "Access" nav item was a link back to the page you were already on.
 * Locks and cards are a place you go, not a thing you peek at: they deserve
 * a URL, a back button, and room for the enrolment flow.
 *
 * DoorCard and NfcManagementCard already render their full views under
 * isExpanded, so this page composes them rather than duplicating markup.
 */

/** Tags that mean "someone came in, or tried to". */
const ACCESS_TAGS = [
  'door-locked', 'door-unlocked', 'window-opened',
  'access-granted', 'access-denied', 'unauthorized',
  'door-lock-device', 'nfc', 'card',
];

export default function AccessPage() {
  const [devicesStatus, setDevicesStatus] = useState<DevicesStatus | null>(null);
  const [lockStates, setLockStates] = useState<Record<string, 'locked' | 'unlocked'>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      let devices: DevicesStatus | undefined;
      try {
        devices = await getAllDevices();
        setDevicesStatus(devices);
      } catch (error) {
        console.error('Error loading devices:', error);
      } finally {
        // Paint the shell; lock states and history refine it.
        setLoading(false);
      }

      const locks = devices?.devices.filter(d => d.device_id.startsWith('dl_')) ?? [];

      await Promise.allSettled([
        Promise.all(
          locks.map(lock =>
            getLockStatus(lock.device_id)
              .then(status => [lock.device_id, status?.lock_state] as const)
              .catch(() => [lock.device_id, undefined] as const),
          ),
        ).then(entries => {
          const next: Record<string, 'locked' | 'unlocked'> = {};
          entries.forEach(([id, state]) => { if (state) next[id] = state; });
          setLockStates(next);
        }),

        getAlerts()
          .then(setAlerts)
          .catch(e => console.error('Error loading alerts:', e)),
      ]);
    };

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const doorsWindows: DoorWindow[] = useMemo(
    () =>
      (devicesStatus?.devices ?? [])
        .filter(device => device.device_id.startsWith('dl_'))
        .map(device => ({
          id: device.device_id,
          name: device.name || device.device_id,
          location: 'Door',
          type: 'door' as const,
          status: lockStates[device.device_id] || 'locked',
          last_changed: device.last_seen || new Date().toISOString(),
          battery: device.battery,
          online: device.online,
        })),
    [devicesStatus, lockStates],
  );

  /* Only entries about getting in. The full feed lives on the dashboard;
     repeating gas readings here would bury the thing you came to check.

     Runs of the same event on the same device collapse into one row with a
     count: the live hub emits "Command 'unlock' completed" once per retry,
     and eight identical lines is the log, not the history. */
  const entries = useMemo(() => {
    const relevant = alerts.filter(alert => {
      const tags = alertTags(alert);
      return tags.some(tag => ACCESS_TAGS.includes(tag)) || (alert.source || '').startsWith('dl_');
    });

    const collapsed: { alert: Alert; title: string; repeats: number }[] = [];
    relevant.forEach(alert => {
      const title = getAlertTitle(alert);
      const last = collapsed[collapsed.length - 1];
      if (last && last.title === title && last.alert.source === alert.source) {
        last.repeats += 1;
        return;
      }
      collapsed.push({ alert, title, repeats: 1 });
    });

    return collapsed.slice(0, 8);
  }, [alerts]);

  const unlockedCount = doorsWindows.filter(d => d.status !== 'locked').length;

  // The gate wraps the loading branch too — see the note on /admin.
  if (loading) {
    return (
      <ProtectedRoute>
        <div className="g-waiting">
          <div className="g-waiting__inner">
            <div className="g-spinner" aria-hidden="true" />
            <h1>Access &amp; cards</h1>
            <p aria-live="polite">Checking locks and enrolled cards.</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <main className="g-page">
        <GlassBar
          current="access"
          pillTone={unlockedCount ? 'warn' : 'ok'}
          pill={
            unlockedCount
              ? `${unlockedCount} ${unlockedCount === 1 ? 'door' : 'doors'} unlocked`
              : 'All doors locked'
          }
        />

        <div className="g-title">
          <h1>Access &amp; cards</h1>
          <p>Lock doors, check battery state, and enrol or revoke NFC cards from the reader.</p>
        </div>

        <section className="g-pane g-card">
          <DoorCard doorsWindows={doorsWindows} isExpanded />
        </section>

        <section className="g-pane g-card">
          <NfcManagementCard isExpanded />
        </section>

        <section className="g-pane g-card">
          <header>
            <h2>Recent entries</h2>
            {/* Count the events, not the rows — collapsing runs must not
                make the log look quieter than it is. */}
            <span className="g-label">{entries.reduce((n, e) => n + e.repeats, 0)} events</span>
          </header>
          {entries.length === 0 ? (
            <div className="g-empty">
              <strong>No entries yet</strong>
              <p>Locks and card taps show up here as they happen.</p>
            </div>
          ) : (
            <div className="g-list">
              {entries.map(({ alert, title, repeats }) => {
                const type = alertLevelToType(alert.level);
                const dot = type === 'critical' ? 'crit' : type === 'warning' ? 'warn' : 'ok';
                return (
                  <div key={alert.id} className="g-list__row">
                    <i className={`g-dot g-dot--${dot}`} />
                    <p>
                      {title}
                      <span>
                        {relativeTime(alert.timestamp)} · {alert.source}
                        {repeats > 1 && ` · ${repeats} times`}
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </ProtectedRoute>
  );
}
