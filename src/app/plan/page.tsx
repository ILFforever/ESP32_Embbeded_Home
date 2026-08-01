'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { getAlerts, getAllDevices, getGasReadingsForDashboard, getLockStatus } from '@/services/devices.service';
import type { Alert, BackendDevice, DevicesStatus, GasReading } from '@/types/dashboard';
import { alertLevelToType } from '@/types/dashboard';
import { getAlertTitle } from '@/utils/alertText';
import { ROOMS, OUTER_WALL, INNER_WALLS, DOOR_SWINGS, DEVICE_ROOMS, type Room, type RoomId } from '@/utils/floorPlan';
import { relativeTime, lastSeenLabel } from '@/utils/time';
import { getCurrentTheme, toggleTheme as toggleGlassTheme, type GlassTheme } from '@/components/glass/theme';

type Tone = 'ok' | 'warn' | 'off';

interface RoomReading {
  /** Short text for the pin callout. Null when there is nothing to show. */
  tag: string | null;
  tone: Tone;
  devices: BackendDevice[];
}

export default function PlanPage() {
  const router = useRouter();
  const { logout, user } = useAuth();
  const [devicesStatus, setDevicesStatus] = useState<DevicesStatus | null>(null);
  const [gasReadings, setGasReadings] = useState<GasReading[]>([]);
  const [lockStates, setLockStates] = useState<Record<string, 'locked' | 'unlocked'>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selected, setSelected] = useState<RoomId>('living');
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState<GlassTheme>('light');

  useEffect(() => setThemeState(getCurrentTheme()), []);

  useEffect(() => {
    const load = async () => {
      try {
        const devices = await getAllDevices();
        setDevicesStatus(devices);
        // Paint the plan now; readings refine what is already drawn.
        setLoading(false);

        void getGasReadingsForDashboard().then(setGasReadings)
          .catch(e => console.error('Error loading gas readings:', e));
        void getAlerts().then(setAlerts)
          .catch(e => console.error('Error loading alerts:', e));

        // Concurrently — a lock at a time meant one round trip each.
        const entries = await Promise.all(
          devices.devices
            .filter(d => d.device_id.startsWith('dl_'))
            .map(lock =>
              getLockStatus(lock.device_id)
                .then(status => [lock.device_id, status?.lock_state] as const)
                .catch(() => [lock.device_id, undefined] as const),
            ),
        );
        const locks: Record<string, 'locked' | 'unlocked'> = {};
        entries.forEach(([id, state]) => { if (state) locks[id] = state; });
        setLockStates(locks);
      } catch (error) {
        console.error('Error loading plan data:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const devices = devicesStatus?.devices ?? [];

  /* One reading per room, chosen by what that room actually has: a gas
     sensor if there is one, otherwise a lock, otherwise the device's
     liveness. Offline devices never contribute a number — a stale value
     shown as current is the thing this dashboard tries hardest not to do. */
  const readings = useMemo(() => {
    const byRoom = {} as Record<RoomId, RoomReading>;

    ROOMS.forEach(room => {
      const inRoom = devices.filter(d => DEVICE_ROOMS[d.device_id] === room.id);
      let tag: string | null = null;
      let tone: Tone = 'off';

      const gasDevice = inRoom.find(d => gasReadings.some(g => g.sensor_id === d.device_id));
      const gas = gasDevice ? gasReadings.find(g => g.sensor_id === gasDevice.device_id) : undefined;
      const lock = inRoom.find(d => d.device_id.startsWith('dl_'));

      if (gas && gasDevice?.online) {
        tag = `${gas.ppm.toFixed(0)} ppm`;
        tone = gas.status === 'safe' ? 'ok' : 'warn';
      } else if (lock && lock.online) {
        const state = lockStates[lock.device_id] ?? 'locked';
        tag = state === 'locked' ? 'Locked' : 'Unlocked';
        tone = state === 'locked' ? 'ok' : 'warn';
      } else if (inRoom.length) {
        tag = 'No reading';
        tone = 'off';
      }

      byRoom[room.id] = { tag, tone, devices: inRoom };
    });
    return byRoom;
  }, [devices, gasReadings, lockStates]);

  const unplaced = devices.filter(d => !DEVICE_ROOMS[d.device_id]);
  const activeRoom = ROOMS.find(r => r.id === selected) as Room;
  const activeReading = readings[selected];

  const onlineCount = devicesStatus?.summary.online ?? 0;
  const totalCount = devicesStatus?.summary.total ?? 0;

  const tagFor = (room: Room) => {
    const r = readings[room.id];
    if (!r?.tag) return null;
    const above = room.tagSide === 'above';
    const width = Math.max(76, r.tag.length * 7 + 24);
    return {
      text: r.tag,
      tone: r.tone,
      x: above ? room.pin.x - width / 2 : room.pin.x + 40,
      y: above ? room.pin.y - 56 : room.pin.y - 13,
      width,
      leader: above
        ? { x1: room.pin.x, y1: room.pin.y, x2: room.pin.x, y2: room.pin.y - 30 }
        : { x1: room.pin.x, y1: room.pin.y, x2: room.pin.x + 40, y2: room.pin.y },
    };
  };

  if (loading) {
    return (
      <div className="g-waiting">
        <div className="g-waiting__inner">
          <div className="g-spinner" aria-hidden="true" />
          <h1>Ground floor</h1>
          <p aria-live="polite">Placing devices on the plan.</p>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="g-page">
        <div className="g-pane g-bar">
          <span className="g-bar__brand">Arduino888</span>
          <nav className="g-seg" data-choice aria-label="Sections">
            <a href="/dashboard">Home</a>
            <a href="/plan" aria-current="page">Plan</a>
            <a href="/dashboard?card=doors">Access</a>
            {user?.role === 'admin' && <a href="/dashboard?card=admin">Admin</a>}
          </nav>
          <button
            className="g-icon-btn g-theme"
            onClick={() => setThemeState(toggleGlassTheme())}
            aria-label="Toggle theme"
            aria-pressed={theme === 'dark'}
          >
            <svg className="g-theme__moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M21 13.3A8.5 8.5 0 1 1 10.7 3a6.7 6.7 0 0 0 10.3 10.3Z" />
            </svg>
            <svg className="g-theme__sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          </button>
          <button className="g-btn g-btn--ghost g-bar__signout" onClick={() => { logout(); router.push('/login'); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            <span>Sign out</span>
          </button>
          <span className={`g-pill ${onlineCount === totalCount && totalCount > 0 ? 'is-ok' : 'is-warn'}`}>
            <i />
            {onlineCount} of {totalCount} online
          </span>
        </div>

        <div className="g-title">
          <h1>Ground floor</h1>
          <p>Devices shown where they physically are. Tap a room for detail.</p>
        </div>

        <div className="pl-wrap">
          <section className="g-pane pl-stage">
            <header>
              <span className="g-label">{devices.length} devices</span>
              <span className="g-label">{onlineCount} reporting</span>
            </header>

            <svg
              className="pl-svg"
              viewBox="0 0 660 440"
              role="img"
              aria-label={`Floor plan. ${ROOMS.map(r => `${r.name}: ${readings[r.id]?.tag ?? 'nothing placed'}`).join('. ')}.`}
            >
              {ROOMS.map(room => (
                <g
                  key={room.id}
                  className="pl-hit"
                  role="button"
                  tabIndex={0}
                  aria-label={room.name}
                  aria-current={selected === room.id ? 'true' : undefined}
                  onClick={() => setSelected(room.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(room.id); }
                  }}
                >
                  <rect className="pl-room" x={room.rect.x} y={room.rect.y} width={room.rect.w} height={room.rect.h} />
                  <rect className="pl-focus" x={room.rect.x + 4} y={room.rect.y + 4} width={room.rect.w - 8} height={room.rect.h - 8} />
                </g>
              ))}

              <path className="pl-wall-i" d={INNER_WALLS} />
              <path className="pl-wall" d={OUTER_WALL} />
              {DOOR_SWINGS.map(d => <path key={d} className="pl-door" d={d} />)}

              {ROOMS.map(room => (
                <text key={room.id} className="pl-name" x={room.label.x} y={room.label.y}>{room.name}</text>
              ))}

              {ROOMS.map(room => {
                const t = tagFor(room);
                if (!t) return null;
                const toneClass = t.tone === 'warn' ? ' is-warn' : t.tone === 'off' ? ' is-off' : '';
                return (
                  <g key={`tag-${room.id}`}>
                    <line className="pl-leader" x1={t.leader.x1} y1={t.leader.y1} x2={t.leader.x2} y2={t.leader.y2} />
                    <rect className={`pl-tag${toneClass}`} x={t.x} y={t.y} width={t.width} height={26} rx={6} />
                    <text className={`pl-val${toneClass}`} x={t.x + 10} y={t.y + 18}>{t.text}</text>
                    {t.tone === 'warn' && <circle className="pl-halo" cx={room.pin.x} cy={room.pin.y} r={13} />}
                    <circle className={`pl-pin is-${t.tone}`} cx={room.pin.x} cy={room.pin.y} r={6} />
                  </g>
                );
              })}
            </svg>

            <div className="pl-legend">
              <span><i className="g-dot g-dot--ok" /> Normal</span>
              <span><i className="g-dot g-dot--warn" /> Needs attention</span>
              <span><i className="g-dot g-dot--off" /> Not reporting</span>
            </div>
          </section>

          <div className="g-stack">
            <section className="g-pane g-card">
              <header>
                <h2>{activeRoom.name}</h2>
                <span className="g-label">
                  {activeReading.devices.length} {activeReading.devices.length === 1 ? 'device' : 'devices'}
                </span>
              </header>

              {activeReading.devices.length === 0 ? (
                <div className="g-empty">
                  <strong>Nothing placed here yet</strong>
                  <p>Add a device id for this room in <code>src/utils/floorPlan.ts</code>.</p>
                </div>
              ) : (
                <div className="g-list">
                  {activeReading.devices.map(d => (
                    <div key={d.device_id} className="g-list__row">
                      <i className={`g-dot g-dot--${d.online ? 'ok' : 'off'}`} />
                      <p>
                        {d.name || d.device_id}
                        <span>
                          {d.online ? `Reporting · ${relativeTime(d.last_seen)}` : lastSeenLabel(d.last_seen)}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="g-pane g-card">
              <header>
                <h2>Today</h2>
                <span className="g-label">{alerts.length} events</span>
              </header>
              {alerts.length === 0 ? (
                <div className="g-empty">
                  <strong>Nothing has happened today</strong>
                  <p>Events show up here as devices report them.</p>
                </div>
              ) : (
                <div className="g-list">
                  {alerts.slice(0, 6).map(a => {
                    const type = alertLevelToType(a.level);
                    const dot = type === 'critical' ? 'crit' : type === 'warning' ? 'warn' : 'off';
                    return (
                      <div key={a.id} className="g-list__row">
                        <i className={`g-dot g-dot--${dot}`} />
                        <p>
                          {getAlertTitle(a)}
                          <span>{relativeTime(a.timestamp)} · {a.source}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {unplaced.length > 0 && (
              <section className="g-pane g-card">
                <header>
                  <h2>Not placed yet</h2>
                  <span className="g-label">{unplaced.length}</span>
                </header>
                <p className="g-sub" style={{ marginTop: 0 }}>
                  These are reporting but have no room. Add their ids to <code>src/utils/floorPlan.ts</code>.
                </p>
                <div className="pl-devs" style={{ marginTop: 'var(--s-3)' }}>
                  {unplaced.map(d => (
                    <div key={d.device_id} className="pl-dev">
                      <i className={`g-dot g-dot--${d.online ? 'ok' : 'off'}`} />
                      <div><b>{d.name || d.device_id}</b><span>{d.device_id}</span></div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
