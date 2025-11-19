import React from 'react';
import { useRouter } from 'next/navigation';
import type { DevicesStatus } from '@/types/dashboard';

interface SystemStatusCardProps {
  devicesStatus: DevicesStatus | null;
  isExpanded?: boolean;
}

export function SystemStatusCard({ devicesStatus, isExpanded = false }: SystemStatusCardProps) {
  const router = useRouter();

  // Extract doorbell and hub devices from the devices array
  const doorbellDevice = devicesStatus?.devices?.find(d => d.type === 'doorbell');
  const hubDevice = devicesStatus?.devices?.find(d => d.type === 'hub' || d.type === 'main_lcd');

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
              <span className={`status-indicator ${getDeviceStatusClass(doorbellDevice?.last_seen)}`}>
                {getDeviceStatusText(doorbellDevice?.last_seen)}
              </span>
            </div>
            {doorbellDevice && (
              <div className="device-info">
                <p>Last Heartbeat: {doorbellDevice.last_seen ? new Date(doorbellDevice.last_seen).toLocaleString() : 'Never'}</p>
                <p>Device ID: {doorbellDevice.device_id || 'N/A'}</p>
                {isExpanded && (
                  <>
                    <p>IP Address: {doorbellDevice.ip_address || 'N/A'}</p>
                    <p>WiFi Signal: {doorbellDevice.wifi_rssi ? `${doorbellDevice.wifi_rssi} dBm` : 'N/A'}</p>
                    <p>Free Heap: {doorbellDevice.free_heap ? `${(doorbellDevice.free_heap / 1024).toFixed(1)} KB` : 'N/A'}</p>
                  </>
                )}
              </div>
            )}
            {!doorbellDevice && (
              <div className="device-info">
                <p>No doorbell device found</p>
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
              <span className={`status-indicator ${getDeviceStatusClass(hubDevice?.last_seen)}`}>
                {getDeviceStatusText(hubDevice?.last_seen)}
              </span>
            </div>
            {hubDevice && (
              <div className="device-info">
                <p>Last Heartbeat: {hubDevice.last_seen ? new Date(hubDevice.last_seen).toLocaleString() : 'Never'}</p>
                <p>Device ID: {hubDevice.device_id || 'N/A'}</p>
                {isExpanded && (
                  <>
                    <p>IP Address: {hubDevice.ip_address || 'N/A'}</p>
                    <p>WiFi Signal: {hubDevice.wifi_rssi ? `${hubDevice.wifi_rssi} dBm` : 'N/A'}</p>
                    <p>Free Heap: {hubDevice.free_heap ? `${(hubDevice.free_heap / 1024).toFixed(1)} KB` : 'N/A'}</p>
                  </>
                )}
              </div>
            )}
            {!hubDevice && (
              <div className="device-info">
                <p>No hub device found</p>
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
                  {devicesStatus?.summary?.online || 0} / {devicesStatus?.summary?.total || 0}
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
