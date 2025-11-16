import React, { useState } from 'react';
import { ChevronDown, ChevronUp, DoorOpen, DoorClosed, Lock, Unlock, Battery } from 'lucide-react';
import type { DoorWindow } from '@/types/dashboard';

interface DoorsWindowsCardProps {
  doorsWindows: DoorWindow[];
}

export function DoorsWindowsCard({ doorsWindows }: DoorsWindowsCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getStatusIcon = (item: DoorWindow) => {
    if (item.type === 'door') {
      return item.status === 'locked' ? (
        <Lock className="status-icon status-locked" size={24} />
      ) : item.status === 'unlocked' ? (
        <Unlock className="status-icon status-unlocked" size={24} />
      ) : (
        <DoorOpen className="status-icon status-open" size={24} />
      );
    } else {
      return item.status === 'open' ? (
        <DoorOpen className="status-icon status-open" size={24} />
      ) : (
        <DoorClosed className="status-icon status-closed" size={24} />
      );
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'locked':
      case 'closed':
        return '#00FF88';
      case 'unlocked':
        return '#FFAA00';
      case 'open':
        return '#FF6600';
      default:
        return '#FFF';
    }
  };

  const getBatteryIcon = (battery: number) => {
    if (battery > 60) return <Battery className="battery-good" size={16} />;
    if (battery > 20) return <Battery className="battery-medium" size={16} />;
    return <Battery className="battery-low" size={16} />;
  };

  const doors = doorsWindows.filter(item => item.type === 'door');
  const windows = doorsWindows.filter(item => item.type === 'window');

  return (
    <div className={`card ${expanded ? 'card-expanded' : ''}`}>
      <div className="card-header" onClick={() => setExpanded(!expanded)}>
        <div className="card-title-group">
          <DoorClosed size={20} />
          <h3>DOORS & WINDOWS</h3>
        </div>
        <button className="expand-button">
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      <div className="card-content">
        {!expanded ? (
          /* Compact view */
          <div className="doors-windows-compact">
            {doorsWindows.map(item => (
              <div key={item.id} className="door-window-item-compact">
                {getStatusIcon(item)}
                <div className="item-info">
                  <span className="item-name">{item.name}</span>
                  <span
                    className="item-status"
                    style={{ color: getStatusColor(item.status) }}
                  >
                    {item.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Expanded view */
          <div className="doors-windows-expanded">
            <div className="section">
              <h4>DOORS ({doors.length})</h4>
              <div className="items-grid">
                {doors.map(door => (
                  <div key={door.id} className="door-window-card">
                    <div className="card-icon-header">
                      {getStatusIcon(door)}
                      <div className="battery-indicator">
                        {getBatteryIcon(door.battery)}
                        <span>{door.battery}%</span>
                      </div>
                    </div>
                    <h5>{door.name}</h5>
                    <div className="status-badge" style={{ borderColor: getStatusColor(door.status) }}>
                      <span style={{ color: getStatusColor(door.status) }}>
                        {door.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="item-details">
                      <p>
                        <span className="detail-label">LOCATION:</span> {door.location}
                      </p>
                      <p>
                        <span className="detail-label">LAST CHANGED:</span>{' '}
                        {new Date(door.last_changed).toLocaleString()}
                      </p>
                      <p>
                        <span className="detail-label">ID:</span> {door.id}
                      </p>
                    </div>
                    <div className="item-actions">
                      {door.status === 'locked' ? (
                        <button className="btn-action btn-unlock">UNLOCK</button>
                      ) : (
                        <button className="btn-action btn-lock">LOCK</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="section">
              <h4>WINDOWS ({windows.length})</h4>
              <div className="items-grid">
                {windows.map(window => (
                  <div key={window.id} className="door-window-card">
                    <div className="card-icon-header">
                      {getStatusIcon(window)}
                      <div className="battery-indicator">
                        {getBatteryIcon(window.battery)}
                        <span>{window.battery}%</span>
                      </div>
                    </div>
                    <h5>{window.name}</h5>
                    <div className="status-badge" style={{ borderColor: getStatusColor(window.status) }}>
                      <span style={{ color: getStatusColor(window.status) }}>
                        {window.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="item-details">
                      <p>
                        <span className="detail-label">LOCATION:</span> {window.location}
                      </p>
                      <p>
                        <span className="detail-label">LAST CHANGED:</span>{' '}
                        {new Date(window.last_changed).toLocaleString()}
                      </p>
                      <p>
                        <span className="detail-label">ID:</span> {window.id}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
