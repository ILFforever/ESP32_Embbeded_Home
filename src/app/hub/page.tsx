'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { getAllDevices } from '@/services/devices.service';
import type { Device } from '@/types/dashboard';

export default function HubControlPage() {
  const router = useRouter();
  const [hubDevice, setHubDevice] = useState<Device | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    autoDiscovery: true,
    cloudSync: true,
    localStorage: true,
    encryption: true,
    autoUpdate: false,
    debugMode: false,
    mqttEnabled: true,
    restApiEnabled: true,
  });

  useEffect(() => {
    const fetchDeviceStatus = async () => {
      try {
        const devicesStatus = await getAllDevices();
        const hub = devicesStatus.devices.find(d => d.type === 'hub' || d.type === 'main_lcd');

        if (hub) {
          setHubDevice(hub);

          // Determine if device is online (last seen within 2 minutes)
          if (hub.last_seen) {
            const lastSeenDate = new Date(hub.last_seen);
            const now = new Date();
            const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / 60000;
            setIsOnline(diffMinutes < 2);
          } else {
            setIsOnline(false);
          }
        }
      } catch (error) {
        console.error('Error fetching hub status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDeviceStatus();
    // Refresh every 5 seconds
    const interval = setInterval(fetchDeviceStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getStatusClass = () => {
    if (!hubDevice || !hubDevice.last_seen) return 'status-offline';

    const lastSeenDate = new Date(hubDevice.last_seen);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / 60000;

    if (diffMinutes < 2) return 'status-online';
    if (diffMinutes < 5) return 'status-warning';
    return 'status-offline';
  };

  const getStatusText = () => {
    if (!hubDevice || !hubDevice.last_seen) return 'OFFLINE';

    const lastSeenDate = new Date(hubDevice.last_seen);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - lastSeenDate.getTime()) / 60000);

    if (diffMinutes < 2) return 'ONLINE';
    if (diffMinutes < 5) return `LAST SEEN ${diffMinutes}M AGO`;
    return 'OFFLINE';
  };

  return (
    <ProtectedRoute>
      <div className="main-content" style={{ marginLeft: 0 }}>
        <div className="dashboard-container">
          <header className="dashboard-header">
            <div className="dashboard-header-left">
              <button className="sidebar-toggle" onClick={() => router.push('/dashboard')}>
                ← Back
              </button>
              <h1>HUB CONTROL</h1>
            </div>
            <div className="dashboard-header-right">
              <div className="header-info">
                <span className={`status-dot ${getStatusClass()}`}></span>
                <span>{getStatusText()}</span>
              </div>
            </div>
          </header>

          <div className="control-page-grid">
            {/* System Overview */}
            <div className="card control-card-large">
              <div className="card-header">
                <h3>SYSTEM OVERVIEW</h3>
              </div>
              <div className="card-content">
                <div className="hub-stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon">🔧</div>
                    <div className="stat-info">
                      <span className="stat-value">12</span>
                      <span className="stat-label">Connected Devices</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">📊</div>
                    <div className="stat-info">
                      <span className="stat-value">1.2K</span>
                      <span className="stat-label">Messages/Hour</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">💾</div>
                    <div className="stat-info">
                      <span className="stat-value">45%</span>
                      <span className="stat-label">Storage Used</span>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">⏱️</div>
                    <div className="stat-info">
                      <span className="stat-value">99.9%</span>
                      <span className="stat-label">Uptime</span>
                    </div>
                  </div>
                </div>

                <div className="resource-meters">
                  <div className="meter-item">
                    <div className="meter-header">
                      <span>CPU Usage</span>
                      <span>32%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: '32%' }}></div>
                    </div>
                  </div>
                  <div className="meter-item">
                    <div className="meter-header">
                      <span>Memory</span>
                      <span>58%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: '58%' }}></div>
                    </div>
                  </div>
                  <div className="meter-item">
                    <div className="meter-header">
                      <span>Network</span>
                      <span>12 Mbps</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: '45%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Hub Settings */}
            <div className="card">
              <div className="card-header">
                <h3>HUB SETTINGS</h3>
              </div>
              <div className="card-content">
                <div className="settings-list">
                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Auto Discovery</span>
                      <span className="setting-description">Automatically find new devices</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.autoDiscovery}
                        onChange={() => toggleSetting('autoDiscovery')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Cloud Sync</span>
                      <span className="setting-description">Sync data to cloud</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.cloudSync}
                        onChange={() => toggleSetting('cloudSync')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Local Storage</span>
                      <span className="setting-description">Store data locally</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.localStorage}
                        onChange={() => toggleSetting('localStorage')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Encryption</span>
                      <span className="setting-description">Encrypt all communications</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.encryption}
                        onChange={() => toggleSetting('encryption')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Auto Update</span>
                      <span className="setting-description">Install updates automatically</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.autoUpdate}
                        onChange={() => toggleSetting('autoUpdate')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Debug Mode</span>
                      <span className="setting-description">Enable verbose logging</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.debugMode}
                        onChange={() => toggleSetting('debugMode')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">MQTT Protocol</span>
                      <span className="setting-description">Enable MQTT messaging</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.mqttEnabled}
                        onChange={() => toggleSetting('mqttEnabled')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">REST API</span>
                      <span className="setting-description">Enable HTTP REST API</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.restApiEnabled}
                        onChange={() => toggleSetting('restApiEnabled')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Connected Devices */}
            <div className="card">
              <div className="card-header">
                <h3>CONNECTED DEVICES</h3>
              </div>
              <div className="card-content">
                <div className="devices-list">
                  <div className="device-item">
                    <span className="device-icon">🚪</span>
                    <div className="device-details">
                      <span className="device-name">Doorbell Camera</span>
                      <span className="device-id">doorbell_001</span>
                    </div>
                    <span className="status-indicator status-online">ONLINE</span>
                  </div>
                  <div className="device-item">
                    <span className="device-icon">🌡️</span>
                    <div className="device-details">
                      <span className="device-name">Temperature Sensor (Living Room)</span>
                      <span className="device-id">temp_lr_001</span>
                    </div>
                    <span className="status-indicator status-online">ONLINE</span>
                  </div>
                  <div className="device-item">
                    <span className="device-icon">🔒</span>
                    <div className="device-details">
                      <span className="device-name">Smart Lock (Front Door)</span>
                      <span className="device-id">lock_fd_001</span>
                    </div>
                    <span className="status-indicator status-online">ONLINE</span>
                  </div>
                  <div className="device-item">
                    <span className="device-icon">💡</span>
                    <div className="device-details">
                      <span className="device-name">Smart Bulb (Bedroom)</span>
                      <span className="device-id">bulb_br_001</span>
                    </div>
                    <span className="status-indicator status-warning">IDLE</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Device Information */}
            <div className="card">
              <div className="card-header">
                <h3>HUB INFORMATION</h3>
              </div>
              <div className="card-content">
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Device ID:</span>
                    <span className="info-value">{hubDevice?.device_id || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Status:</span>
                    <span className="info-value">{isOnline ? 'Online' : 'Offline'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Type:</span>
                    <span className="info-value">{hubDevice?.type || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">IP Address:</span>
                    <span className="info-value">{hubDevice?.ip_address || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Last Seen:</span>
                    <span className="info-value">
                      {hubDevice?.last_seen ? new Date(hubDevice.last_seen).toLocaleString() : 'Never'}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">WiFi Signal:</span>
                    <span className="info-value">
                      {hubDevice?.wifi_rssi ? `${hubDevice.wifi_rssi} dBm` : 'N/A'}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Uptime:</span>
                    <span className="info-value">
                      {hubDevice?.uptime_ms ? `${Math.floor(hubDevice.uptime_ms / 3600000)}h ${Math.floor((hubDevice.uptime_ms % 3600000) / 60000)}m` : 'N/A'}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Free Heap:</span>
                    <span className="info-value">
                      {hubDevice?.free_heap ? `${(hubDevice.free_heap / 1024).toFixed(1)} KB` : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="action-buttons">
                  <button className="btn-action">Restart Hub</button>
                  <button className="btn-action">Clear Cache</button>
                  <button className="btn-action btn-stop">Factory Reset</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
