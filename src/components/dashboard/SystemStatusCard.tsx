import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Battery, Info, List, Cpu, Radio, X, Droplet, Thermometer, Wind, Zap } from 'lucide-react';
import type { DevicesStatus, Device } from '@/types/dashboard';
import { getDeviceStatusClass as getStatusClass, getDeviceStatusText as getStatusText } from '@/services/devices.service';

interface SystemStatusCardProps {
  devicesStatus: DevicesStatus | null;
  isExpanded?: boolean;
}

export function SystemStatusCard({ devicesStatus, isExpanded = false }: SystemStatusCardProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'devices' | 'sensors'>('devices');
  const [selectedSensor, setSelectedSensor] = useState<Device | null>(null);

  // Extract doorbell and hub devices from the devices array
  const doorbellDevice = devicesStatus?.devices?.find(d => d.type === 'doorbell');
  const hubDevice = devicesStatus?.devices?.find(d => d.type === 'hub' || d.type === 'main_lcd');
  const allDevices = devicesStatus?.devices || [];

  const nonSensorOnlineDevices = allDevices.filter(device =>
    device.online && device.type !== 'sensor' && device.type !== 'gas_sensor' && !device.device_id.startsWith('dl_')
  ).length;

  const onlineSensors = allDevices.filter(device =>
    device.online && (device.type === 'sensor' || device.type === 'gas_sensor')
  ).length;

  const totalNonSensorDevices = allDevices.filter(device =>
    device.type !== 'sensor' && device.type !== 'gas_sensor' && !device.device_id.startsWith('dl_')
  ).length;
  const totalSensorDevices = allDevices.filter(device => device.type === 'sensor' || device.type === 'gas_sensor').length;

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

  // Helper function to get battery percentage from device
  const getBatteryPercent = (device: Device): number | undefined => {
    // For sensors, battery is in sensor_data.battery_percent
    if ((device.type === 'sensor' || device.type === 'gas_sensor') && device.sensor_data) {
      return device.sensor_data.battery_percent;
    }
    // For other devices, use the battery field directly
    return device.battery;
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

  const handleSensorClick = (sensor: Device) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSensor(sensor);
  };

  const closeSensorModal = () => {
    setSelectedSensor(null);
  };

  // Helper function to format Firebase timestamp
  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '-';
    try {
      let date: Date;

      // Check if it's a Firebase Timestamp with seconds property
      if (timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      }
      // Check if it has toDate method (Firebase Timestamp)
      else if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      }
      // Try to parse as regular date string
      else {
        date = new Date(timestamp);
      }

      if (isNaN(date.getTime())) return '-';

      // Format: "December 6, 2025 at 8:42:23 PM UTC+7"
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZoneName: 'longOffset'
      };

      return date.toLocaleString('en-US', options).replace(',', ' at');
    } catch (error) {
      return '-';
    }
  };

  // If expanded (popup mode), show all devices or sensors with toggle
  if (isExpanded) {
    const displayDevices = viewMode === 'devices'
      ? allDevices.filter(device => device.type !== 'sensor' && device.type !== 'gas_sensor' && !device.device_id.startsWith('dl_'))
      : allDevices.filter(device => device.type === 'sensor' || device.type === 'gas_sensor');

    return (
      <div className="card card-large">
        <div className="card-header">
          <h2>SYSTEM STATUS</h2>
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'devices' ? 'active' : ''}`}
              onClick={() => setViewMode('devices')}
            >
              <Cpu size={16} />
              Devices
            </button>
            <button
              className={`toggle-btn ${viewMode === 'sensors' ? 'active' : ''}`}
              onClick={() => setViewMode('sensors')}
            >
              <Radio size={16} />
              Sensors
            </button>
          </div>
        </div>
        <div className="card-content">
          <div className="system-status-grid">
            {/* All Devices or Sensors in Popup */}
            {displayDevices.map((device) => (
              <div
                key={device.device_id}
                className="device-status-item device-clickable"
                onClick={(e) => {
                  e.stopPropagation();
                  if (viewMode === 'sensors') {
                    handleSensorClick(device)(e);
                  } else {
                    handleDeviceClick(device)(e);
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="device-status-header">
                  <h3>{device.name?.toUpperCase() || device.type?.toUpperCase()}</h3>
                  <div className="status-group">
                    {viewMode === 'sensors' ? (
                      // For sensors: show OFFLINE or battery
                      isDeviceOffline(device) ? (
                        <span className={`status-indicator ${getDeviceStatusClass(device.online, device.last_seen, device.type)}`}>
                          OFFLINE
                        </span>
                      ) : (
                        getBatteryPercent(device) !== undefined && (
                          <div className={`battery-indicator ${getBatteryClass(getBatteryPercent(device))}`}>
                            {getBatteryIcon(getBatteryPercent(device))}
                            <span>{getBatteryPercent(device)}%</span>
                          </div>
                        )
                      )
                    ) : (
                      // For devices: show online status and battery
                      <>
                        <span className={`status-indicator ${getDeviceStatusClass(device.online, device.last_seen, device.type)}`}>
                          {getDeviceStatusText(device.online, device.last_seen, device.type)}
                        </span>
                        {getBatteryPercent(device) !== undefined && (
                          <div className={`battery-indicator ${getBatteryClass(getBatteryPercent(device))}`}>
                            {getBatteryIcon(getBatteryPercent(device))}
                            <span>{getBatteryPercent(device)}%</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="device-info">
                  <p>Last Heartbeat: {device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never'}</p>
                  {viewMode === 'sensors' ? (
                    // Reduced info for sensors
                    <>
                      <p>Device ID: {device.device_id || 'N/A'}</p>
                      {getBatteryPercent(device) !== undefined && (
                        <p>Battery: {getBatteryPercent(device)}%</p>
                      )}
                    </>
                  ) : (
                    // Full info for devices
                    <>
                      <p>Device ID: {device.device_id || 'N/A'}</p>
                      <p>IP Address: {isDeviceOffline(device) ? '-' : (device.ip_address || 'N/A')}</p>
                      <p>WiFi Signal: {isDeviceOffline(device) ? '-' : (device.wifi_rssi ? `${device.wifi_rssi} dBm` : 'N/A')}</p>
                      <p>Free Heap: {isDeviceOffline(device) ? '-' : (device.free_heap ? `${(device.free_heap / 1024).toFixed(1)} KB` : 'N/A')}</p>
                      <p>Uptime: {isDeviceOffline(device) ? '-' : (device.uptime_ms ? `${Math.floor(device.uptime_ms / 3600000)}h ${Math.floor((device.uptime_ms % 3600000) / 60000)}m` : 'N/A')}</p>
                      {getBatteryPercent(device) !== undefined && (
                        <p>Battery: {getBatteryPercent(device)}%</p>
                      )}
                    </>
                  )}
                </div>
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
             {/* System Overview */}
          <div className="device-status-item system-overview">
            <h3 style={{ marginBottom: 'var(--spacing-sm)' }}>SYSTEM HEALTH</h3>
            <div className="health-metrics">
              <div className="health-metric">
                <span className="metric-label">DEVICES ONLINE:</span>
                <span className="metric-value">
                  {nonSensorOnlineDevices} / {totalNonSensorDevices}
                </span>
              </div>
              <div className="health-metric">
                <span className="metric-label">SENSORS ONLINE:</span>
                <span className="metric-value">
                  {onlineSensors} / {totalSensorDevices}
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

        {/* Sensor Detail Modal */}
        {selectedSensor && (
          <div className="modal-overlay" onClick={closeSensorModal}>
            <div className="modal-content sensor-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{selectedSensor.name?.toUpperCase() || 'SENSOR DETAILS'}</h2>
                <button className="modal-close" onClick={closeSensorModal}>
                  <X size={24} />
                </button>
              </div>
              <div className="modal-body">
                {/* Status Section */}
                <div className="sensor-detail-section">
                  <h3>STATUS</h3>
                  <div className="sensor-detail-grid">
                    <div className="sensor-field">
                      <span className="field-label">Connection Status:</span>
                      <span className={`field-value status-indicator ${getDeviceStatusClass(selectedSensor.online, selectedSensor.last_seen, selectedSensor.type)}`}>
                        {selectedSensor.online ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>
                    <div className="sensor-field">
                      <span className="field-label">Device ID:</span>
                      <span className="field-value">{selectedSensor.device_id || '-'}</span>
                    </div>
                    <div className="sensor-field">
                      <span className="field-label">Device Type:</span>
                      <span className="field-value">{selectedSensor.sensor_data?.device_type || selectedSensor.type || '-'}</span>
                    </div>
                    <div className="sensor-field">
                      <span className="field-label">Last Updated:</span>
                      <span className="field-value">
                        {formatTimestamp(selectedSensor.last_seen)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Power Section */}
                <div className="sensor-detail-section">
                  <h3>POWER</h3>
                  <div className="sensor-detail-grid">
                    <div className="sensor-field">
                      <span className="field-label">Battery Level:</span>
                      <span className="field-value">
                        {!selectedSensor.online
                          ? '-'
                          : (getBatteryPercent(selectedSensor) !== undefined
                              ? `${getBatteryPercent(selectedSensor)}%`
                              : '-')}
                      </span>
                    </div>
                    <div className="sensor-field">
                      <span className="field-label">Battery Voltage:</span>
                      <span className="field-value">
                        {!selectedSensor.online
                          ? '-'
                          : (selectedSensor.sensor_data?.battery_voltage
                              ? `${selectedSensor.sensor_data.battery_voltage.toFixed(2)}V`
                              : '-')}
                      </span>
                    </div>
                    <div className="sensor-field">
                      <span className="field-label">Boot Count:</span>
                      <span className="field-value">
                        {!selectedSensor.online
                          ? '-'
                          : (selectedSensor.sensor_data?.boot_count ?? '-')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sensor Readings */}
                {(selectedSensor.type === 'sensor' || selectedSensor.type === 'gas_sensor') && (
                  <div className="sensor-detail-section">
                    <h3>SENSOR READINGS</h3>
                    <div className="sensor-detail-grid">
                      {selectedSensor.sensor_data?.temperature !== undefined && (
                        <div className="sensor-field">
                          <span className="field-label">
                            <Thermometer size={16} style={{ display: 'inline', marginRight: '4px' }} />
                            Temperature:
                          </span>
                          <span className="field-value">
                            {!selectedSensor.online
                              ? '-'
                              : `${selectedSensor.sensor_data.temperature.toFixed(1)}°C`}
                          </span>
                        </div>
                      )}
                      {selectedSensor.sensor_data?.humidity !== undefined && (
                        <div className="sensor-field">
                          <span className="field-label">
                            <Droplet size={16} style={{ display: 'inline', marginRight: '4px' }} />
                            Humidity:
                          </span>
                          <span className="field-value">
                            {!selectedSensor.online
                              ? '-'
                              : `${selectedSensor.sensor_data.humidity.toFixed(1)}%`}
                          </span>
                        </div>
                      )}
                      {selectedSensor.sensor_data?.light_lux !== undefined && (
                        <div className="sensor-field">
                          <span className="field-label">
                            <Zap size={16} style={{ display: 'inline', marginRight: '4px' }} />
                            Light Level:
                          </span>
                          <span className="field-value">
                            {!selectedSensor.online
                              ? '-'
                              : `${selectedSensor.sensor_data.light_lux.toFixed(0)} lux`}
                          </span>
                        </div>
                      )}
                      {selectedSensor.sensor_data?.gas_level !== undefined && (
                        <div className="sensor-field">
                          <span className="field-label">
                            <Wind size={16} style={{ display: 'inline', marginRight: '4px' }} />
                            Gas Level:
                          </span>
                          <span className="field-value">
                            {!selectedSensor.online
                              ? '-'
                              : `${selectedSensor.sensor_data.gas_level} ppm`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Additional Info */}
                <div className="sensor-detail-section">
                  <h3>ADDITIONAL INFO</h3>
                  <div className="sensor-detail-grid">
                    <div className="sensor-field">
                      <span className="field-label">Forwarded By:</span>
                      <span className="field-value">
                        {!selectedSensor.online
                          ? '-'
                          : (selectedSensor.sensor_data?.forwarded_by || '-')}
                      </span>
                    </div>
                    <div className="sensor-field">
                      <span className="field-label">Alert Status:</span>
                      <span className="field-value">
                        {!selectedSensor.online
                          ? '-'
                          : (selectedSensor.sensor_data?.alert ? 'ACTIVE' : 'NORMAL')}
                      </span>
                    </div>
                    <div className="sensor-field">
                      <span className="field-label">Data Averaged:</span>
                      <span className="field-value">
                        {!selectedSensor.online
                          ? '-'
                          : (selectedSensor.sensor_data?.averaged ? 'Yes' : 'No')}
                      </span>
                    </div>
                    <div className="sensor-field">
                      <span className="field-label">Sample Count:</span>
                      <span className="field-value">
                        {!selectedSensor.online
                          ? '-'
                          : (selectedSensor.sensor_data?.sample_count ?? '-')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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
        <div className="system-status-grid-compact">
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
                {doorbellDevice && getBatteryPercent(doorbellDevice) !== undefined && (
                  <div className={`battery-indicator ${getBatteryClass(getBatteryPercent(doorbellDevice))}`}>
                    {getBatteryIcon(getBatteryPercent(doorbellDevice))}
                    <span>{getBatteryPercent(doorbellDevice)}%</span>
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
                {hubDevice && getBatteryPercent(hubDevice) !== undefined && (
                  <div className={`battery-indicator ${getBatteryClass(getBatteryPercent(hubDevice))}`}>
                    {getBatteryIcon(getBatteryPercent(hubDevice))}
                    <span>{getBatteryPercent(hubDevice)}%</span>
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
                  {nonSensorOnlineDevices} / {totalNonSensorDevices}
                </span>
              </div>
              <div className="health-metric">
                <span className="metric-label">SENSORS ONLINE:</span>
                <span className="metric-value">
                  {onlineSensors} / {totalSensorDevices}
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