import React from 'react';
import { useRouter } from 'next/navigation';
import type { DevicesStatus } from '@/types/dashboard';

interface SystemStatusCardProps {
  devicesStatus: DevicesStatus | null;
  isExpanded?: boolean;
}

export function SystemStatusCard({ devicesStatus, isExpanded = false }: SystemStatusCardProps) {
  const router = useRouter();

  const getDeviceStatusClass = (lastSeen: string | null | undefined) => {
    if (!lastSeen) return 'status-offline';

    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / 60000;

    if (diffMinutes < 2) return 'status-online';
    if (diffMinutes < 5) return 'status-warning';
    return 'status-offline';
  };

  const getDeviceStatusText = (lastSeen: string | null | undefined) => {
    if (!lastSeen) return 'OFFLINE';

    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - lastSeenDate.getTime()) / 60000);

    if (diffMinutes < 2) return 'ONLINE';
    if (diffMinutes < 5) return `LAST SEEN ${diffMinutes}M AGO`;
    return 'OFFLINE';
  };

  const handleDoorbellClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push('/doorbell');
  };

  const handleHubClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push('/hub');
  };

  return (
    <div className="card card-large">
      <div className="card-header">
        <h2>SYSTEM STATUS</h2>
      </div>
      <div className="card-content">
        <div className="system-status-grid">
          {/* Doorbell Status */}
          <div
            className="device-status-item device-clickable"
            onClick={handleDoorbellClick}
            style={{ cursor: 'pointer' }}
          >
            <div className="device-status-header">
              <h3>DOORBELL</h3>
              <span className={`status-indicator ${getDeviceStatusClass(devicesStatus?.doorbell?.last_seen)}`}>
                {getDeviceStatusText(devicesStatus?.doorbell?.last_seen)}
              </span>
            </div>
            {devicesStatus?.doorbell?.last_seen && (
              <div className="device-info">
                <p>Last Heartbeat: {new Date(devicesStatus.doorbell.last_seen).toLocaleString()}</p>
                <p>Device ID: {devicesStatus.doorbell.device_id || 'doorbell_001'}</p>
                {isExpanded && (
                  <>
                    <p>IP Address: 192.168.1.100</p>
                    <p>Firmware: v2.4.1</p>
                    <p>WiFi Signal: -45 dBm</p>
                  </>
                )}
              </div>
            )}
            <p className="device-hint">Click to configure →</p>
          </div>

          {/* Hub Status */}
          <div
            className="device-status-item device-clickable"
            onClick={handleHubClick}
            style={{ cursor: 'pointer' }}
          >
            <div className="device-status-header">
              <h3>HUB</h3>
              <span className={`status-indicator ${getDeviceStatusClass(devicesStatus?.hub?.last_seen)}`}>
                {getDeviceStatusText(devicesStatus?.hub?.last_seen)}
              </span>
            </div>
            {devicesStatus?.hub?.last_seen && (
              <div className="device-info">
                <p>Last Heartbeat: {new Date(devicesStatus.hub.last_seen).toLocaleString()}</p>
                <p>Device ID: {devicesStatus?.hub.device_id || 'hub_001'}</p>
                {isExpanded && (
                  <>
                    <p>IP Address: 192.168.1.50</p>
                    <p>Firmware: v3.2.0</p>
                    <p>Connected Devices: 12</p>
                  </>
                )}
              </div>
            )}
            <p className="device-hint">Click to configure →</p>
          </div>

          {/* System Overview */}
          <div className="device-status-item system-overview">
            <h3>SYSTEM HEALTH</h3>
            <div className="health-metrics">
              <div className="health-metric">
                <span className="metric-label">DEVICES ONLINE:</span>
                <span className="metric-value">
                  {[
                    devicesStatus?.doorbell?.last_seen,
                    devicesStatus?.hub?.last_seen
                  ].filter(lastSeen => {
                    if (!lastSeen) return false;
                    const diffMinutes = (new Date().getTime() - new Date(lastSeen).getTime()) / 60000;
                    return diffMinutes < 2;
                  }).length} / 2
                </span>
              </div>
              <div className="health-metric">
                <span className="metric-label">UPTIME:</span>
                <span className="metric-value">99.8%</span>
              </div>
              <div className="health-metric">
                <span className="metric-label">LAST SYNC:</span>
                <span className="metric-value">
                  {devicesStatus ? new Date().toLocaleTimeString() : 'N/A'}
                </span>
              </div>
              {isExpanded && (
                <>
                  <div className="health-metric">
                    <span className="metric-label">AVG RESPONSE TIME:</span>
                    <span className="metric-value">42ms</span>
                  </div>
                  <div className="health-metric">
                    <span className="metric-label">DATA USAGE TODAY:</span>
                    <span className="metric-value">2.4 GB</span>
                  </div>
                  <div className="health-metric">
                    <span className="metric-label">ALERTS THIS WEEK:</span>
                    <span className="metric-value">15</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
