'use client';

import React, { useState } from 'react';
import { Cpu, Power, Activity, Wifi, Clock, Radio } from 'lucide-react';
import { getDeviceStatusClass, getDeviceStatusText } from '@/services/devices.service';
import type { Device, SensorData } from '@/types/dashboard';

interface DeviceStatusCardProps {
  devices?: Device[];
  sensors?: SensorData[];
  isExpanded?: boolean;
}

export function DeviceStatusCard({ devices = [], sensors = [], isExpanded = false }: DeviceStatusCardProps) {
  const [viewMode, setViewMode] = useState<'devices' | 'sensors'>('devices');

  // Calculate device statistics
  const totalDevices = devices.length;
  const onlineDevices = devices.filter(d => d.online).length;
  const offlineDevices = totalDevices - onlineDevices;

  // Calculate sensor statistics
  const totalSensors = sensors.length;
  const activeSensors = sensors.filter(s => s.timestamp &&
    new Date().getTime() - new Date(s.timestamp).getTime() < 300000 // Active if data within 5 mins
  ).length;
  const inactiveSensors = totalSensors - activeSensors;

  // Group devices by type
  const devicesByType = devices.reduce((acc, device) => {
    const type = device.type || 'unknown';
    if (!acc[type]) acc[type] = [];
    acc[type].push(device);
    return acc;
  }, {} as Record<string, Device[]>);

  // Helper function to get device type icon
  const getDeviceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'doorbell':
        return '🔔';
      case 'hub':
      case 'main_lcd':
        return '🏠';
      case 'sensor':
        return '📡';
      default:
        return '💻';
    }
  };

  // Helper function to format last seen time
  const formatLastSeen = (lastSeen: string | null) => {
    if (!lastSeen) return 'Never';

    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          {viewMode === 'devices' ? <Cpu size={20} /> : <Radio size={20} />}
          <h3>{viewMode === 'devices' ? 'DEVICES' : 'SENSORS'}</h3>
        </div>
        {isExpanded && (
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
        )}
      </div>

      <div className="card-content">
        {!isExpanded ? (
          /* Compact view */
          <div className="device-status-compact">
            <div className="device-stats">
              <div className="stat-item">
                {viewMode === 'devices' ? <Cpu size={24} className="stat-icon" /> : <Radio size={24} className="stat-icon" />}
                <div className="stat-content">
                  <span className="stat-value">{viewMode === 'devices' ? totalDevices : totalSensors}</span>
                  <span className="stat-label">TOTAL</span>
                </div>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <Power size={24} className="stat-icon status-online" />
                <div className="stat-content">
                  <span className="stat-value status-online">{viewMode === 'devices' ? onlineDevices : activeSensors}</span>
                  <span className="stat-label">{viewMode === 'devices' ? 'ONLINE' : 'ACTIVE'}</span>
                </div>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <Power size={24} className="stat-icon status-offline" />
                <div className="stat-content">
                  <span className="stat-value status-offline">{viewMode === 'devices' ? offlineDevices : inactiveSensors}</span>
                  <span className="stat-label">{viewMode === 'devices' ? 'OFFLINE' : 'INACTIVE'}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Expanded view */
          <div className="device-status-expanded">
            {viewMode === 'devices' ? (
              <>
                {/* Summary Section */}
                <div className="device-summary">
                  <div className="summary-card">
                    <div className="summary-icon">
                      <Cpu size={32} />
                    </div>
                    <div className="summary-content">
                      <h4>{totalDevices}</h4>
                      <p>Total Devices</p>
                    </div>
                  </div>
                  <div className="summary-card online">
                    <div className="summary-icon">
                      <Power size={32} />
                    </div>
                    <div className="summary-content">
                      <h4>{onlineDevices}</h4>
                      <p>Online</p>
                    </div>
                  </div>
                  <div className="summary-card offline">
                    <div className="summary-icon">
                      <Power size={32} />
                    </div>
                    <div className="summary-content">
                      <h4>{offlineDevices}</h4>
                      <p>Offline</p>
                    </div>
                  </div>
                </div>

                {/* Devices List */}
                <div className="devices-list">
                  {devices.length === 0 ? (
                    <div className="empty-message">No devices found</div>
                  ) : (
                devices.map(device => (
                  <div
                    key={device.device_id}
                    className={`device-item ${device.online ? 'online' : 'offline'}`}
                  >
                    <div className="device-item-header">
                      <div className="device-item-icon">
                        {getDeviceIcon(device.type)}
                      </div>
                      <div className="device-item-info">
                        <h5>{device.name}</h5>
                        <span className="device-type">{device.type}</span>
                      </div>
                      <div className={`device-status-badge ${device.online ? 'online' : 'offline'}`}>
                        <Activity size={12} />
                        {device.online ? 'ONLINE' : 'OFFLINE'}
                      </div>
                    </div>

                    <div className="device-item-details">
                      <div className="detail-row">
                        <span className="detail-label">
                          <Cpu size={14} /> Device ID:
                        </span>
                        <span className="detail-value">{device.device_id}</span>
                      </div>

                      {device.online && device.ip_address && (
                        <div className="detail-row">
                          <span className="detail-label">
                            <Wifi size={14} /> IP Address:
                          </span>
                          <span className="detail-value">{device.ip_address}</span>
                        </div>
                      )}

                      <div className="detail-row">
                        <span className="detail-label">
                          <Clock size={14} /> Last Seen:
                        </span>
                        <span className="detail-value">
                          {formatLastSeen(device.last_seen)}
                        </span>
                      </div>

                      {device.online && (
                        <>
                          {device.wifi_rssi && (
                            <div className="detail-row">
                              <span className="detail-label">
                                <Wifi size={14} /> WiFi Signal:
                              </span>
                              <span className="detail-value">{device.wifi_rssi} dBm</span>
                            </div>
                          )}

                          {device.uptime_ms && (
                            <div className="detail-row">
                              <span className="detail-label">
                                <Activity size={14} /> Uptime:
                              </span>
                              <span className="detail-value">
                                {Math.floor(device.uptime_ms / 3600000)}h {Math.floor((device.uptime_ms % 3600000) / 60000)}m
                              </span>
                            </div>
                          )}

                          {device.free_heap && (
                            <div className="detail-row">
                              <span className="detail-label">
                                <Cpu size={14} /> Free Heap:
                              </span>
                              <span className="detail-value">
                                {(device.free_heap / 1024).toFixed(1)} KB
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Sensors Summary Section */}
                <div className="device-summary">
                  <div className="summary-card">
                    <div className="summary-icon">
                      <Radio size={32} />
                    </div>
                    <div className="summary-content">
                      <h4>{totalSensors}</h4>
                      <p>Total Sensors</p>
                    </div>
                  </div>
                  <div className="summary-card online">
                    <div className="summary-icon">
                      <Activity size={32} />
                    </div>
                    <div className="summary-content">
                      <h4>{activeSensors}</h4>
                      <p>Active</p>
                    </div>
                  </div>
                  <div className="summary-card offline">
                    <div className="summary-icon">
                      <Activity size={32} />
                    </div>
                    <div className="summary-content">
                      <h4>{inactiveSensors}</h4>
                      <p>Inactive</p>
                    </div>
                  </div>
                </div>

                {/* Sensors List */}
                <div className="devices-list">
                  {sensors.length === 0 ? (
                    <div className="empty-message">No sensors found</div>
                  ) : (
                    sensors.map(sensor => {
                      const isActive = sensor.timestamp &&
                        new Date().getTime() - new Date(sensor.timestamp).getTime() < 300000;

                      return (
                        <div
                          key={sensor.device_id}
                          className={`device-item ${isActive ? 'online' : 'offline'}`}
                        >
                          <div className="device-item-header">
                            <div className="device-item-icon">
                              📡
                            </div>
                            <div className="device-item-info">
                              <h5>{sensor.device_id}</h5>
                              <span className="device-type">Sensor</span>
                            </div>
                            <div className={`device-status-badge ${isActive ? 'online' : 'offline'}`}>
                              <Activity size={12} />
                              {isActive ? 'ACTIVE' : 'INACTIVE'}
                            </div>
                          </div>

                          <div className="device-item-details">
                            {sensor.sensors.temperature !== undefined && (
                              <div className="detail-row">
                                <span className="detail-label">
                                  🌡️ Temperature:
                                </span>
                                <span className="detail-value">{sensor.sensors.temperature}°C</span>
                              </div>
                            )}

                            {sensor.sensors.humidity !== undefined && (
                              <div className="detail-row">
                                <span className="detail-label">
                                  💧 Humidity:
                                </span>
                                <span className="detail-value">{sensor.sensors.humidity}%</span>
                              </div>
                            )}

                            {sensor.sensors.pm25 !== undefined && (
                              <div className="detail-row">
                                <span className="detail-label">
                                  🌫️ PM2.5:
                                </span>
                                <span className="detail-value">{sensor.sensors.pm25} µg/m³</span>
                              </div>
                            )}

                            {sensor.sensors.pm10 !== undefined && (
                              <div className="detail-row">
                                <span className="detail-label">
                                  🌫️ PM10:
                                </span>
                                <span className="detail-value">{sensor.sensors.pm10} µg/m³</span>
                              </div>
                            )}

                            {sensor.sensors.co2 !== undefined && (
                              <div className="detail-row">
                                <span className="detail-label">
                                  💨 CO2:
                                </span>
                                <span className="detail-value">{sensor.sensors.co2} ppm</span>
                              </div>
                            )}

                            {sensor.sensors.motion !== undefined && (
                              <div className="detail-row">
                                <span className="detail-label">
                                  🚶 Motion:
                                </span>
                                <span className="detail-value">{sensor.sensors.motion ? 'Detected' : 'None'}</span>
                              </div>
                            )}

                            {sensor.timestamp && (
                              <div className="detail-row">
                                <span className="detail-label">
                                  <Clock size={14} /> Last Update:
                                </span>
                                <span className="detail-value">
                                  {formatLastSeen(sensor.timestamp)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .view-toggle {
          display: flex;
          gap: 0.5rem;
          background: rgba(0, 0, 0, 0.3);
          padding: 0.25rem;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .toggle-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          transition: all 0.3s ease;
        }

        .toggle-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.7);
        }

        .toggle-btn.active {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: #fff;
          box-shadow: 0 2px 8px rgba(var(--primary-color-rgb), 0.3);
        }

        .device-status-compact {
          padding: 0.5rem 0;
        }

        .device-stats {
          display: flex;
          justify-content: space-around;
          align-items: center;
          gap: 1rem;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          flex: 1;
          padding: 1rem;
        }

        .stat-icon {
          color: var(--primary-color);
          flex-shrink: 0;
        }

        .stat-icon.status-online {
          color: #4CAF50;
        }

        .stat-icon.status-offline {
          color: #F44336;
        }

        .stat-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
        }

        .stat-value {
          font-size: 2rem;
          font-weight: 700;
          color: var(--primary-color);
          line-height: 1;
        }

        .stat-value.status-online {
          color: #4CAF50;
        }

        .stat-value.status-offline {
          color: #F44336;
        }

        .stat-label {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 1px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .stat-divider {
          width: 1px;
          height: 60px;
          background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.2), transparent);
          opacity: 0.5;
        }

        .device-status-expanded {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .device-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
        }

        .summary-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 1.5rem;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          transition: all 0.3s ease;
        }

        .summary-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .summary-card.online {
          background: rgba(76, 175, 80, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }

        .summary-card.offline {
          background: rgba(244, 67, 54, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }

        .summary-icon {
          color: var(--primary-color);
          flex-shrink: 0;
        }

        .summary-card.online .summary-icon {
          color: #4CAF50;
        }

        .summary-card.offline .summary-icon {
          color: #F44336;
        }

        .summary-content h4 {
          font-size: 2.5rem;
          font-weight: 800;
          margin: 0;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .summary-content p {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.6);
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .devices-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-height: 500px;
          overflow-y: auto;
          padding-right: 0.5rem;
        }

        .devices-list::-webkit-scrollbar {
          width: 6px;
        }

        .devices-list::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 3px;
        }

        .devices-list::-webkit-scrollbar-thumb {
          background: var(--primary-color);
          border-radius: 3px;
        }

        .device-item {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(var(--primary-color-rgb), 0.3);
          border-radius: 8px;
          padding: 1rem;
          transition: all 0.3s ease;
        }

        .device-item:hover {
          border-color: var(--primary-color);
          box-shadow: 0 2px 8px rgba(var(--primary-color-rgb), 0.2);
        }

        .device-item.online {
          border-left: 3px solid #4CAF50;
        }

        .device-item.offline {
          border-left: 3px solid #F44336;
          opacity: 0.7;
        }

        .device-item-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(var(--primary-color-rgb), 0.2);
        }

        .device-item-icon {
          font-size: 2rem;
          flex-shrink: 0;
        }

        .device-item-info {
          flex: 1;
        }

        .device-item-info h5 {
          font-size: 1rem;
          font-weight: 600;
          margin: 0 0 0.25rem 0;
          color: #fff;
        }

        .device-type {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .device-status-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.5px;
          flex-shrink: 0;
        }

        .device-status-badge.online {
          background: rgba(76, 175, 80, 0.2);
          color: #4CAF50;
          border: 1px solid #4CAF50;
        }

        .device-status-badge.offline {
          background: rgba(244, 67, 54, 0.2);
          color: #F44336;
          border: 1px solid #F44336;
        }

        .device-item-details {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
        }

        .detail-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(255, 255, 255, 0.5);
          font-weight: 500;
        }

        .detail-value {
          color: var(--primary-color);
          font-family: 'Courier New', monospace;
          font-weight: 600;
        }

        .empty-message {
          padding: 2rem;
          text-align: center;
          color: rgba(255, 255, 255, 0.5);
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
