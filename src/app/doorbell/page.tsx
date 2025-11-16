'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

export default function DoorbellControlPage() {
  const router = useRouter();
  const [settings, setSettings] = useState({
    cameraEnabled: true,
    micEnabled: true,
    speakerEnabled: true,
    motionDetection: true,
    nightVision: true,
    faceRecognition: false,
    recordingEnabled: true,
    notificationsEnabled: true,
    sensitivity: 75,
    volume: 60,
  });

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({
      ...prev,
      [key]: typeof prev[key] === 'boolean' ? !prev[key] : prev[key]
    }));
  };

  const updateSlider = (key: keyof typeof settings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
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
              <h1>DOORBELL CONTROL</h1>
            </div>
            <div className="dashboard-header-right">
              <div className="header-info">
                <span className="status-dot status-online"></span>
                <span>ONLINE</span>
              </div>
            </div>
          </header>

          <div className="control-page-grid">
            {/* Live Feed */}
            <div className="card control-card-large">
              <div className="card-header">
                <h3>LIVE CAMERA FEED</h3>
              </div>
              <div className="card-content">
                <div className="camera-feed-placeholder">
                  <div className="camera-icon">📹</div>
                  <p>Camera feed will appear here</p>
                  <p className="text-muted">Resolution: 1080p | FPS: 30</p>
                </div>
              </div>
            </div>

            {/* Device Settings */}
            <div className="card">
              <div className="card-header">
                <h3>DEVICE SETTINGS</h3>
              </div>
              <div className="card-content">
                <div className="settings-list">
                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Camera</span>
                      <span className="setting-description">Enable video recording</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.cameraEnabled}
                        onChange={() => toggleSetting('cameraEnabled')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Microphone</span>
                      <span className="setting-description">Enable audio recording</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.micEnabled}
                        onChange={() => toggleSetting('micEnabled')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Speaker</span>
                      <span className="setting-description">Enable two-way audio</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.speakerEnabled}
                        onChange={() => toggleSetting('speakerEnabled')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Motion Detection</span>
                      <span className="setting-description">Detect motion and send alerts</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.motionDetection}
                        onChange={() => toggleSetting('motionDetection')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Night Vision</span>
                      <span className="setting-description">Enable infrared night mode</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.nightVision}
                        onChange={() => toggleSetting('nightVision')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Face Recognition</span>
                      <span className="setting-description">Identify known faces</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.faceRecognition}
                        onChange={() => toggleSetting('faceRecognition')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Recording</span>
                      <span className="setting-description">Save recordings to cloud</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.recordingEnabled}
                        onChange={() => toggleSetting('recordingEnabled')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div className="setting-info">
                      <span className="setting-label">Notifications</span>
                      <span className="setting-description">Push alerts to phone</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.notificationsEnabled}
                        onChange={() => toggleSetting('notificationsEnabled')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="card">
              <div className="card-header">
                <h3>ADVANCED SETTINGS</h3>
              </div>
              <div className="card-content">
                <div className="settings-list">
                  <div className="setting-item-slider">
                    <div className="setting-info">
                      <span className="setting-label">Motion Sensitivity</span>
                      <span className="setting-value">{settings.sensitivity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.sensitivity}
                      onChange={(e) => updateSlider('sensitivity', parseInt(e.target.value))}
                      className="slider"
                    />
                  </div>

                  <div className="setting-item-slider">
                    <div className="setting-info">
                      <span className="setting-label">Speaker Volume</span>
                      <span className="setting-value">{settings.volume}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.volume}
                      onChange={(e) => updateSlider('volume', parseInt(e.target.value))}
                      className="slider"
                    />
                  </div>
                </div>

                <div className="device-info-section">
                  <h4>Device Information</h4>
                  <div className="info-grid">
                    <div className="info-item">
                      <span className="info-label">Device ID:</span>
                      <span className="info-value">doorbell_001</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Firmware:</span>
                      <span className="info-value">v2.4.1</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">IP Address:</span>
                      <span className="info-value">192.168.1.100</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">MAC Address:</span>
                      <span className="info-value">AA:BB:CC:DD:EE:FF</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">WiFi Signal:</span>
                      <span className="info-value">-45 dBm (Excellent)</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Uptime:</span>
                      <span className="info-value">72h 15m</span>
                    </div>
                  </div>
                </div>

                <div className="action-buttons">
                  <button className="btn-action">Restart Device</button>
                  <button className="btn-action btn-stop">Factory Reset</button>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="card">
              <div className="card-header">
                <h3>RECENT ACTIVITY</h3>
              </div>
              <div className="card-content">
                <div className="activity-list">
                  <div className="activity-item">
                    <span className="activity-time">2:30 PM</span>
                    <span className="activity-desc">Motion detected</span>
                    <span className="activity-status status-safe">Normal</span>
                  </div>
                  <div className="activity-item">
                    <span className="activity-time">11:45 AM</span>
                    <span className="activity-desc">Doorbell pressed</span>
                    <span className="activity-status status-safe">Delivered</span>
                  </div>
                  <div className="activity-item">
                    <span className="activity-time">9:20 AM</span>
                    <span className="activity-desc">Face recognized: John Doe</span>
                    <span className="activity-status status-safe">Known</span>
                  </div>
                  <div className="activity-item">
                    <span className="activity-time">8:00 AM</span>
                    <span className="activity-desc">Recording started</span>
                    <span className="activity-status status-safe">Auto</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
