import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Battery, Info, List } from 'lucide-react';
import type { DevicesStatus, Device } from '@/types/dashboard';
import { getDeviceStatusClass as getStatusClass, getDeviceStatusText as getStatusText } from '@/services/devices.service';

interface SystemStatusCardProps {
  devicesStatus: DevicesStatus | null;
  isExpanded?: boolean;
}

export function SystemStatusCard({ devicesStatus, isExpanded = false }: SystemStatusCardProps) {
  const router = useRouter();
  const [showFullInfo, setShowFullInfo] = useState(false);

  // Extract doorbell and hub devices from the devices array
  const doorbellDevice = devicesStatus?.devices?.find(d => d.type === 'doorbell');
  const hubDevice = devicesStatus?.devices?.find(d => d.type === 'hub' || d.type === 'main_lcd');
  const allDevices = devicesStatus?.devices || [];

  // Helper functions using online boolean from backend
  const getDeviceStatusClass = (online: boolean, lastSeen: string | null | undefined, deviceType?: string) => {
    return getStatusClass(online, lastSeen || null, deviceType);
  };

  const getDeviceStatusText = (online: boolean, lastSeen: string | null | undefined, deviceType?: string) => {
    return getStatusText(online, lastSeen || null, deviceType);
  };

  const getBatteryIcon = (battery: number | undefined) => {
    if (!battery) return <Battery className="battery-low" size={16} />;
    if (battery > 60) return <Battery className="battery-good" size={16} />;
    if (battery > 20) return <Battery className="battery-medium" size={16} />;
    return <Battery className="battery-low" size={16} />;
  };

  const getBatteryClass = (battery: number | undefined) => {
    if (!battery) return 'battery-low';
    if (battery > 60) return 'battery-good';
    if (battery > 20) return 'battery-medium';
    return 'battery-low';
  };

  const isDeviceOffline = (device: Device) => {
    return !device.online;
  };

  const handleDoorbellClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push('/doorbell');
  };

  const handleHubClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push('/hub');
  };

  const handleDeviceClick = (device: Device) => (e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to device-specific page if available
    if (device.type === 'doorbell') {
      router.push('/doorbell');
    } else if (device.type === 'hub' || device.type === 'main_lcd') {
      router.push('/hub');
    }
  };

  // If expanded (popup mode), show all devices
  if (isExpanded) {
    return (
      <div className="card card-large">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>SYSTEM STATUS</h2>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowFullInfo(!showFullInfo);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: showFullInfo ? 'rgba(0, 212, 170, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              border: showFullInfo ? '1px solid rgba(0, 212, 170, 0.5)' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
            }}
          >
            {showFullInfo ? (
              <>
                <List size={16} />
                COMPACT VIEW
              </>
            ) : (
              <>
                <Info size={16} />
                FULL INFO
              </>
            )}
          </button>
        </div>
        <div className="card-content">
          <div className="system-status-grid">
            {/* All Devices in Popup */}
            {allDevices.map((device) => (
              <div
                key={device.device_id}
                className="device-status-item device-clickable"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFullInfo(!showFullInfo);
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="device-status-header">
                  <h3>{device.name?.toUpperCase() || device.type?.toUpperCase()}</h3>
                  <div className="status-group">
                    <span className={`status-indicator ${getDeviceStatusClass(device.online, device.last_seen, device.type)}`}>
                      {getDeviceStatusText(device.online, device.last_seen, device.type)}
                    </span>
                    {device.battery !== undefined && (
                      <div className={`battery-indicator ${getBatteryClass(device.battery)}`}>
                        {getBatteryIcon(device.battery)}
                        <span>{device.battery}%</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Conditionally show full info or compact */}
                {showFullInfo && (
                  <div className="device-info">
                    <p>Last Heartbeat: {device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never'}</p>
                    <p>Device ID: {device.device_id || 'N/A'}</p>
                    <p>IP Address: {isDeviceOffline(device) ? '-' : (device.ip_address || 'N/A')}</p>
                    <p>WiFi Signal: {isDeviceOffline(device) ? '-' : (device.wifi_rssi ? `${device.wifi_rssi} dBm` : 'N/A')}</p>
                    <p>Free Heap: {isDeviceOffline(device) ? '-' : (device.free_heap ? `${(device.free_heap / 1024).toFixed(1)} KB` : 'N/A')}</p>
                    <p>Uptime: {isDeviceOffline(device) ? '-' : (device.uptime_ms ? `${Math.floor(device.uptime_ms / 3600000)}h ${Math.floor((device.uptime_ms % 3600000) / 60000)}m` : 'N/A')}</p>
                    {device.battery !== undefined && (
                      <p>Battery: {device.battery}%</p>
                    )}
                  </div>
                )}

                {/* Show hint for clickable devices */}
                {(device.type === 'doorbell' || device.type === 'hub' || device.type === 'main_lcd') && (
                  <p
                    className="device-hint"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeviceClick(device)(e);
                    }}
                  >
                    Click to configure →
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Normal card view - show only Doorbell and Hub
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
              <div className="status-group">
                <span className={`status-indicator ${getDeviceStatusClass(doorbellDevice?.online || false, doorbellDevice?.last_seen, doorbellDevice?.type)}`}>
                  {getDeviceStatusText(doorbellDevice?.online || false, doorbellDevice?.last_seen, doorbellDevice?.type)}
                </span>
                {doorbellDevice?.battery !== undefined && (
                  <div className={`battery-indicator ${getBatteryClass(doorbellDevice.battery)}`}>
                    {getBatteryIcon(doorbellDevice.battery)}
                    <span>{doorbellDevice.battery}%</span>
                  </div>
                )}
              </div>
            </div>
            {doorbellDevice && (
              <div className="device-info">
                <p>Last Heartbeat: {doorbellDevice.last_seen ? new Date(doorbellDevice.last_seen).toLocaleString() : 'Never'}</p>
                <p>Device ID: {doorbellDevice.device_id || 'N/A'}</p>
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
              <div className="status-group">
                <span className={`status-indicator ${getDeviceStatusClass(hubDevice?.online || false, hubDevice?.last_seen, hubDevice?.type)}`}>
                  {getDeviceStatusText(hubDevice?.online || false, hubDevice?.last_seen, hubDevice?.type)}
                </span>
                {hubDevice?.battery !== undefined && (
                  <div className={`battery-indicator ${getBatteryClass(hubDevice.battery)}`}>
                    {getBatteryIcon(hubDevice.battery)}
                    <span>{hubDevice.battery}%</span>
                  </div>
                )}
              </div>
            </div>
            {hubDevice && (
              <div className="device-info">
                <p>Last Heartbeat: {hubDevice.last_seen ? new Date(hubDevice.last_seen).toLocaleString() : 'Never'}</p>
                <p>Device ID: {hubDevice.device_id || 'N/A'}</p>
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
            <h3 style={{ marginBottom: 'var(--spacing-sm)' }}>SYSTEM HEALTH</h3>
            <div className="health-metrics">
              <div className="health-metric">
                <span className="metric-label">DEVICES ONLINE:</span>
                <span className="metric-value">
                  {devicesStatus?.summary?.online || 0} / {devicesStatus?.summary?.total || 0}
                </span>
              </div>
              <div className="health-metric">
                <span className="metric-label">DEVICES OFFLINE:</span>
                <span className="metric-value">
                  {devicesStatus?.summary?.offline || 0}
                </span>
              </div>
              <div className="health-metric">
                <span className="metric-label">LAST SYNC:</span>
                <span className="metric-value">
                  {devicesStatus ? new Date().toLocaleTimeString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}