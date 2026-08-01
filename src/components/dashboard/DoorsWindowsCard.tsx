import React from 'react';
import { DoorClosed, DoorOpen, Lock, Unlock } from 'lucide-react';
import type { DoorWindow } from '@/types/dashboard';
import { relativeTime } from '@/utils/time';

interface DoorsWindowsCardProps {
  doorsWindows: DoorWindow[];
  isExpanded?: boolean;
}

const RING_CIRCUMFERENCE = 56.5;

function statusTone(status: DoorWindow['status']) {
  if (status === 'locked' || status === 'closed') return 'ok';
  if (status === 'unlocked') return 'warn';
  return 'crit';
}

function statusCopy(status: DoorWindow['status']) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusIcon(item: DoorWindow) {
  const tone = statusTone(item.status);
  const props = { size: 18, 'aria-hidden': true, color: 'currentColor' };

  if (item.type === 'door') {
    if (item.status === 'locked') return <Lock {...props} />;
    if (item.status === 'unlocked') return <Unlock {...props} />;
    return <DoorOpen {...props} />;
  }

  return item.status === 'open' ? <DoorOpen {...props} /> : <DoorClosed {...props} />;
}

function ringClass(battery?: number) {
  if (battery == null) return 'g-ring__fill is-idle';
  if (battery <= 20) return 'g-ring__fill is-crit';
  if (battery <= 40) return 'g-ring__fill is-warn';
  return 'g-ring__fill';
}

function batteryDash(battery?: number) {
  const pct = Math.max(0, Math.min(100, battery ?? 0));
  return `${((pct / 100) * RING_CIRCUMFERENCE).toFixed(1)} ${RING_CIRCUMFERENCE}`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not reported';
  return relativeTime(date);
}

function DoorWindowRow({ item }: { item: DoorWindow }) {
  const tone = statusTone(item.status);

  return (
    <div className="g-list__row">
      <i className={`g-dot g-dot--${tone}`} />
      <p>
        {item.name}
        <span>{item.location} · {statusCopy(item.status)} · {formatTime(item.last_changed)}</span>
      </p>
      <span className={`g-chip ${tone === 'ok' ? 'g-chip--ok' : tone === 'warn' ? 'g-chip--warn' : 'g-chip--crit'}`}>
        {statusCopy(item.status)}
      </span>
    </div>
  );
}

function DeviceTile({ item }: { item: DoorWindow }) {
  const tone = statusTone(item.status);

  return (
    <div className={`g-tile ${tone === 'warn' ? 'is-warn' : tone === 'crit' ? 'is-crit' : ''}`}>
      <div className="g-row g-row--between">
        <div className="g-row">
          <span className={`g-dot g-dot--${tone}`} />
          <strong>{item.name}</strong>
        </div>
        <svg className="g-ring" viewBox="0 0 24 24" aria-label={`${item.name} battery ${item.battery ?? 0} percent`}>
          <circle className="g-ring__track" cx="12" cy="12" r="9" />
          <circle
            className={ringClass(item.battery)}
            cx="12"
            cy="12"
            r="9"
            strokeDasharray={batteryDash(item.battery)}
            transform="rotate(-90 12 12)"
          />
        </svg>
      </div>
      <div className="g-row g-row--between" style={{ marginTop: 'var(--s-3)' }}>
        <span className={`g-chip ${tone === 'ok' ? 'g-chip--ok' : tone === 'warn' ? 'g-chip--warn' : 'g-chip--crit'}`}>
          {statusCopy(item.status)}
        </span>
        <span className="g-num">{item.battery ?? 0}%</span>
      </div>
      <dl className="g-info" style={{ marginTop: 'var(--s-4)' }}>
        <div>
          <dt>Location</dt>
          <dd>{item.location}</dd>
        </div>
        <div>
          <dt>Last changed</dt>
          <dd>{formatTime(item.last_changed)}</dd>
        </div>
        <div>
          <dt>Device ID</dt>
          <dd>{item.id}</dd>
        </div>
      </dl>
    </div>
  );
}

export function DoorsWindowsCard({ doorsWindows, isExpanded = false }: DoorsWindowsCardProps) {
  const doors = doorsWindows.filter(item => item.type === 'door');
  const windows = doorsWindows.filter(item => item.type === 'window');
  const openCount = doorsWindows.filter(item => item.status === 'open' || item.status === 'unlocked').length;

  if (!isExpanded) {
    return (
      <>
        <header>
          <h2>Doors & windows</h2>
          <span className={`g-label ${openCount ? 'is-warn' : ''}`}>{openCount ? `${openCount} open` : 'All secure'}</span>
        </header>
        {doorsWindows.length ? (
          <div className="g-list">
            {doorsWindows.slice(0, 4).map(item => (
              <DoorWindowRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="g-empty">
            <strong>No access sensors</strong>
            <p>No door or window devices have reported yet.</p>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="g-stack">
      <div className="dash-modal-grid dash-modal-grid--2">
        <div className="g-tile">
          <p className="g-label">Doors</p>
          <div className="g-metric-sm g-num">{doors.length}</div>
        </div>
        <div className={openCount ? 'g-tile is-warn' : 'g-tile'}>
          <p className="g-label">Open or unlocked</p>
          <div className="g-metric-sm g-num">{openCount}</div>
        </div>
      </div>

      <section className="g-stack">
        <div className="g-row g-row--between">
          <h3>Doors</h3>
          <span className="g-label">{doors.length} locks</span>
        </div>
        <div className="g-grid g-grid--2">
          {doors.map(door => <DeviceTile key={door.id} item={door} />)}
        </div>
      </section>

      {windows.length > 0 && (
        <section className="g-stack">
          <div className="g-row g-row--between">
            <h3>Windows</h3>
            <span className="g-label">{windows.length} sensors</span>
          </div>
          <div className="g-grid g-grid--2">
            {windows.map(window => <DeviceTile key={window.id} item={window} />)}
          </div>
        </section>
      )}
    </div>
  );
}
