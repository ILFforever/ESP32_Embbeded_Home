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

  const handleDeviceClick = (device: Device) => (e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to device-specific page if available
    if (device.type === 'doorbell') {
      router.push('/doorbell');
    } else if (device.type === 'hub' || device.type === 'main_lcd') {
      router.push('/hub');
    }
  };

  const devices = devicesStatus?.devices || [];

  return (
    <div className="card card-large">
      <div className="card-header">
        <h2>SYSTEM STATUS</h2>
      </div>
      <div className="card-content">
        <div className="system-status-grid">
          {/* All Devices */}
          {devices.map((device) => (
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

              {/* Expanded view - show additional details */}
              {isExpanded && (
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
                <p className="device-hint">Click to configure →</p>
              )}
            </div>
          ))}

          {/* No devices found */}
          {devices.length === 0 && (
            <div className="device-status-item">
              <div className="device-info">
                <p>No devices found</p>
              </div>
            </div>
          )}

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