import React from 'react';
import { useRouter } from 'next/navigation';
import { Battery } from 'lucide-react';
import type { DevicesStatus, Device } from '@/types/dashboard';
import { getDeviceStatusClass as getStatusClass, getDeviceStatusText as getStatusText } from '@/services/devices.service';

interface SystemStatusCardProps {
  devicesStatus: DevicesStatus | null;
  isExpanded?: boolean;
}

export function SystemStatusCard({ devicesStatus, isExpanded = false }: SystemStatusCardProps) {
  const router = useRouter();

  // Extract doorbell and hub devices from the devices array
  const doorbellDevice = devicesStatus?.devices?.find(d => d.type === 'doorbell');
  const hubDevice = devicesStatus?.devices?.find(d => d.type === 'hub' || d.type === 'main_lcd');
  const allDevices = devicesStatus?.devices || [];

  // Helper functions using online boolean from backend
  const getDeviceStatusClass = (online: boolean, lastSeen: string | null | undefined) => {
    return getStatusClass(online, lastSeen || null);
  };

  const getDeviceStatusText = (online: boolean, lastSeen: string | null | undefined) => {
    return getStatusText(online, lastSeen || null);
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
        <div className="card-header">
          <h2>SYSTEM STATUS</h2>
        </div>
        <div className="card-content">
          <div className="system-status-grid">
            {/* All Devices in Popup */}
            {allDevices.map((device) => (
              <div
                key={device.device_id}
                className={`device-status-item ${device.type === 'doorbell' || device.type === 'hub' || device.type === 'main_lcd' ? 'device-clickable' : ''}`}
                onClick={device.type === 'doorbell' || device.type === 'hub' || device.type === 'main_lcd' ? handleDeviceClick(device) : undefined}
                style={device.type === 'doorbell' || device.type === 'hub' || device.type === 'main_lcd' ? { cursor: 'pointer' } : {}}
              >
                <div className="device-status-header">
                  <h3>{device.name?.toUpperCase() || device.type?.toUpperCase()}</h3>
                  <div className="status-group">
                    <span className={`status-indicator ${getDeviceStatusClass(device.online, device.last_seen)}`}>
                      {getDeviceStatusText(device.online, device.last_seen)}
                    </span>
                    {device.battery !== undefined && (
                      <div className={`battery-indicator ${getBatteryClass(device.battery)}`}>
                        {getBatteryIcon(device.battery)}
                        <span>{device.battery}%</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded view details */}
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

                {/* Show hint for clickable devices */}
                {(device.type === 'doorbell' || device.type === 'hub' || device.type === 'main_lcd') && (
                  <p className="device-hint">Click to configure →</p>
                )}
              </div>
            ))}

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
                <span className={`status-indicator ${getDeviceStatusClass(doorbellDevice?.online || false, doorbellDevice?.last_seen)}`}>
                  {getDeviceStatusText(doorbellDevice?.online || false, doorbellDevice?.last_seen)}
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
                <span className={`status-indicator ${getDeviceStatusClass(hubDevice?.online || false, hubDevice?.last_seen)}`}>
                  {getDeviceStatusText(hubDevice?.online || false, hubDevice?.last_seen)}
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