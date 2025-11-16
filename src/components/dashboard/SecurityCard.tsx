import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Shield, Lock, Unlock, Camera, Bell as AlarmIcon, Battery } from 'lucide-react';
import type { SecurityDevice } from '@/types/dashboard';

interface SecurityCardProps {
  securityDevices: SecurityDevice[];
}

export function SecurityCard({ securityDevices }: SecurityCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getDeviceIcon = (device: SecurityDevice) => {
    switch (device.type) {
      case 'lock':
        return device.status === 'locked' ? (
          <Lock className="device-icon status-locked" size={24} />
        ) : (
          <Unlock className="device-icon status-unlocked" size={24} />
        );
      case 'alarm':
        return <AlarmIcon className="device-icon" size={24} />;
      case 'camera':
        return <Camera className="device-icon" size={24} />;
      default:
        return <Shield className="device-icon" size={24} />;
    }
  };

  const getStatusColor = (device: SecurityDevice) => {
    if (device.type === 'lock') {
      return device.status === 'locked' ? '#00FF88' : '#FF6600';
    } else if (device.type === 'alarm') {
      return device.status === 'armed' ? '#00FF88' : '#FFAA00';
    } else if (device.type === 'camera') {
      return device.status === 'armed' ? '#00FF88' : '#FFAA00';
    }
    return '#FFF';
  };

  const locks = securityDevices.filter(d => d.type === 'lock');
  const alarms = securityDevices.filter(d => d.type === 'alarm');
  const cameras = securityDevices.filter(d => d.type === 'camera');

  const allLocksSecured = locks.every(lock => lock.status === 'locked');
  const allAlarmsArmed = alarms.every(alarm => alarm.status === 'armed');

  return (
    <div className={`card ${expanded ? 'card-expanded' : ''}`}>
      <div className="card-header" onClick={() => setExpanded(!expanded)}>
        <div className="card-title-group">
          <Shield size={20} />
          <h3>SECURITY</h3>
        </div>
        <button className="expand-button">
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      <div className="card-content">
        {!expanded ? (
          /* Compact view */
          <div className="security-compact">
            <div className="security-overview">
              <div className="overview-item">
                <Lock size={20} />
                <span>{allLocksSecured ? 'ALL LOCKED' : 'SOME UNLOCKED'}</span>
                <span className={`status-indicator ${allLocksSecured ? 'status-safe' : 'status-warning'}`}>
                  {locks.filter(l => l.status === 'locked').length}/{locks.length}
                </span>
              </div>
              <div className="overview-item">
                <AlarmIcon size={20} />
                <span>{allAlarmsArmed ? 'ARMED' : 'DISARMED'}</span>
                <span className={`status-indicator ${allAlarmsArmed ? 'status-safe' : 'status-warning'}`}>
                  {alarms.filter(a => a.status === 'armed').length}/{alarms.length}
                </span>
              </div>
              <div className="overview-item">
                <Camera size={20} />
                <span>CAMERAS</span>
                <span className="status-indicator">
                  {cameras.filter(c => c.status === 'armed').length}/{cameras.length}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Expanded view */
          <div className="security-expanded">
            {/* Locks Section */}
            <div className="security-section">
              <div className="section-header">
                <h4>LOCKS ({locks.length})</h4>
                <div className="section-actions">
                  <button className="btn-action-sm btn-lock-all">LOCK ALL</button>
                  <button className="btn-action-sm btn-unlock-all">UNLOCK ALL</button>
                </div>
              </div>
              <div className="devices-grid">
                {locks.map(lock => (
                  <div key={lock.id} className="security-device-card">
                    <div className="device-header">
                      {getDeviceIcon(lock)}
                      <div className="device-info-header">
                        <h5>{lock.name}</h5>
                        <span className="device-location">{lock.location}</span>
                      </div>
                      {lock.battery !== undefined && (
                        <div className="battery-indicator">
                          <Battery size={16} />
                          <span>{lock.battery}%</span>
                        </div>
                      )}
                    </div>
                    <div className="device-status-badge" style={{ borderColor: getStatusColor(lock) }}>
                      <span style={{ color: getStatusColor(lock) }}>
                        {lock.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="device-actions">
                      {lock.status === 'locked' ? (
                        <button className="btn-action btn-unlock">UNLOCK</button>
                      ) : (
                        <button className="btn-action btn-lock">LOCK</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Alarms Section */}
            <div className="security-section">
              <div className="section-header">
                <h4>ALARMS ({alarms.length})</h4>
                <div className="section-actions">
                  <button className="btn-action-sm btn-arm-all">ARM ALL</button>
                  <button className="btn-action-sm btn-disarm-all">DISARM ALL</button>
                </div>
              </div>
              <div className="devices-grid">
                {alarms.map(alarm => (
                  <div key={alarm.id} className="security-device-card">
                    <div className="device-header">
                      {getDeviceIcon(alarm)}
                      <div className="device-info-header">
                        <h5>{alarm.name}</h5>
                        <span className="device-location">{alarm.location}</span>
                      </div>
                    </div>
                    <div className="device-status-badge" style={{ borderColor: getStatusColor(alarm) }}>
                      <span style={{ color: getStatusColor(alarm) }}>
                        {alarm.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="device-actions">
                      {alarm.status === 'armed' ? (
                        <button className="btn-action btn-disarm">DISARM</button>
                      ) : (
                        <button className="btn-action btn-arm">ARM</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cameras Section */}
            <div className="security-section">
              <div className="section-header">
                <h4>CAMERAS ({cameras.length})</h4>
                <div className="section-actions">
                  <button className="btn-action-sm">VIEW ALL</button>
                </div>
              </div>
              <div className="devices-grid">
                {cameras.map(camera => (
                  <div key={camera.id} className="security-device-card">
                    <div className="device-header">
                      {getDeviceIcon(camera)}
                      <div className="device-info-header">
                        <h5>{camera.name}</h5>
                        <span className="device-location">{camera.location}</span>
                      </div>
                    </div>
                    <div className="device-status-badge" style={{ borderColor: getStatusColor(camera) }}>
                      <span style={{ color: getStatusColor(camera) }}>
                        {camera.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="device-actions">
                      <button className="btn-action btn-view">VIEW FEED</button>
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
