'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import {
  getAllDevices,
  findHubDevice,
  getHubSensorData,
  restartSystem,
  getDeviceStatusClass,
  getDeviceStatusText,
  getAQICategory
} from '@/services/devices.service';
import type { Device, HubSensorData } from '@/types/dashboard';
import { Thermometer, Droplets, Wind, Activity, Power, RefreshCw } from 'lucide-react';

export default function HubControlPage() {
  const router = useRouter();
  const [hubDevice, setHubDevice] = useState<Device | null>(null);
  const [sensorData, setSensorData] = useState<HubSensorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const devicesStatus = await getAllDevices();
        const hub = findHubDevice(devicesStatus.devices);

        if (hub) {
          setHubDevice(hub);

          // Fetch sensor data
          const sensors = await getHubSensorData(hub.device_id);
          setSensorData(sensors);
        }
      } catch (error) {
        console.error('Error fetching hub data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Refresh every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRestart = async () => {
    if (!hubDevice) return;

    const confirmed = confirm('Are you sure you want to restart the hub? This will take a few minutes.');
    if (!confirmed) return;

    try {
      setRestarting(true);
      await restartSystem(hubDevice.device_id);
      alert('Hub restart command sent successfully!');
    } catch (error) {
      console.error('Error restarting hub:', error);
      alert('Failed to restart hub. Please try again.');
    } finally {
      setRestarting(false);
    }
  };

  const getTemperatureStatus = (temp: number) => {
    if (temp < 18) return { text: 'Cold', color: '#4FC3F7', status: 'status-warning' };
    if (temp <= 25) return { text: 'Comfortable', color: 'var(--success)', status: 'status-online' };
    if (temp <= 30) return { text: 'Warm', color: 'var(--warning)', status: 'status-warning' };
    return { text: 'Hot', color: 'var(--danger)', status: 'status-offline' };
  };

  const getHumidityStatus = (humidity: number) => {
    if (humidity < 30) return { text: 'Dry', color: 'var(--warning)', status: 'status-warning' };
    if (humidity <= 60) return { text: 'Comfortable', color: 'var(--success)', status: 'status-online' };
    return { text: 'Humid', color: 'var(--warning)', status: 'status-warning' };
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="dashboard-loading">
          <div className="loading-spinner"></div>
          <p>Loading hub data...</p>
        </div>
      </ProtectedRoute>
    );
  }

  const statusClass = hubDevice ? getDeviceStatusClass(hubDevice.online, hubDevice.last_seen) : 'status-offline';
  const statusText = hubDevice ? getDeviceStatusText(hubDevice.online, hubDevice.last_seen) : 'OFFLINE';
  const tempStatus = sensorData?.dht11 ? getTemperatureStatus(sensorData.dht11.temperature) : null;
  const humidityStatus = sensorData?.dht11 ? getHumidityStatus(sensorData.dht11.humidity) : null;
  const aqiData = sensorData?.pm25?.aqi ? getAQICategory(sensorData.pm25.aqi) : null;

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
                <span className={`status-dot ${statusClass}`}></span>
                <span>{statusText}</span>
              </div>
            </div>
          </header>

          <div className="control-page-grid">
            {/* Temperature Card (DHT11) */}
            <div className="card">
              <div className="card-header">
                <div className="card-title-group">
                  <Thermometer size={24} />
                  <h3>TEMPERATURE</h3>
                </div>
                {tempStatus && (
                  <span className={`status-indicator ${tempStatus.status}`}>
                    {tempStatus.text}
                  </span>
                )}
              </div>
              <div className="card-content">
                {sensorData?.dht11 ? (
                  <>
                    <div
                      className="card-value"
                      style={{
                        fontSize: '56px',
                        color: tempStatus?.color,
                        textAlign: 'center',
                        margin: '20px 0'
                      }}
                    >
                      {sensorData.dht11.temperature.toFixed(1)}°C
                    </div>
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <p style={{ fontSize: '14px', marginBottom: '8px' }}>
                        Last updated: {new Date(sensorData.timestamp).toLocaleTimeString()}
                      </p>
                      <div className="temp-ranges" style={{
                        display: 'flex',
                        justifyContent: 'space-around',
                        marginTop: '16px',
                        padding: '12px',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '8px'
                      }}>
                        <div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Comfort Range</div>
                          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>18-25°C</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Device</div>
                          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>DHT11</div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="no-alerts">
                    <Activity size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                    <p>No temperature data available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Humidity Card (DHT11) */}
            <div className="card">
              <div className="card-header">
                <div className="card-title-group">
                  <Droplets size={24} />
                  <h3>HUMIDITY</h3>
                </div>
                {humidityStatus && (
                  <span className={`status-indicator ${humidityStatus.status}`}>
                    {humidityStatus.text}
                  </span>
                )}
              </div>
              <div className="card-content">
                {sensorData?.dht11 ? (
                  <>
                    <div
                      className="card-value"
                      style={{
                        fontSize: '56px',
                        color: humidityStatus?.color,
                        textAlign: 'center',
                        margin: '20px 0'
                      }}
                    >
                      {sensorData.dht11.humidity.toFixed(1)}%
                    </div>
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <p style={{ fontSize: '14px', marginBottom: '8px' }}>
                        Last updated: {new Date(sensorData.timestamp).toLocaleTimeString()}
                      </p>
                      <div className="progress-bar" style={{ marginTop: '16px' }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: `${Math.min(sensorData.dht11.humidity, 100)}%`,
                            background: humidityStatus?.color
                          }}
                        ></div>
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-around',
                        marginTop: '16px',
                        padding: '12px',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '8px'
                      }}>
                        <div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Comfort Range</div>
                          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>30-60%</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Device</div>
                          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>DHT11</div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="no-alerts">
                    <Activity size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                    <p>No humidity data available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Air Quality Card (PM2.5) */}
            <div className="card control-card-large">
              <div className="card-header">
                <div className="card-title-group">
                  <Wind size={24} />
                  <h3>AIR QUALITY (PM2.5)</h3>
                </div>
                {aqiData && (
                  <span className={`status-indicator ${aqiData.status}`}>
                    {aqiData.category}
                  </span>
                )}
              </div>
              <div className="card-content">
                {sensorData?.pm25 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>PM2.5</div>
                      <div
                        className="card-value"
                        style={{
                          fontSize: '48px',
                          color: aqiData?.color
                        }}
                      >
                        {sensorData.pm25.pm25.toFixed(1)}
                      </div>
                      <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>μg/m³</div>
                    </div>

                    {sensorData.pm25.pm10 !== undefined && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>PM10</div>
                        <div
                          className="card-value"
                          style={{ fontSize: '48px' }}
                        >
                          {sensorData.pm25.pm10.toFixed(1)}
                        </div>
                        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>μg/m³</div>
                      </div>
                    )}

                    {sensorData.pm25.aqi !== undefined && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>AQI</div>
                        <div
                          className="card-value"
                          style={{
                            fontSize: '48px',
                            color: aqiData?.color
                          }}
                        >
                          {sensorData.pm25.aqi}
                        </div>
                        <div style={{ fontSize: '14px', color: aqiData?.color, fontWeight: 'bold' }}>
                          {aqiData?.category}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="no-alerts">
                    <Wind size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                    <p>No air quality data available</p>
                  </div>
                )}

                {sensorData?.pm25 && (
                  <div style={{
                    marginTop: '24px',
                    padding: '16px',
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '8px',
                    borderLeft: `4px solid ${aqiData?.color}`
                  }}>
                    <h4 style={{ marginBottom: '12px', color: 'var(--primary)' }}>AQI Information</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', fontSize: '12px' }}>
                      <div>
                        <span style={{ color: 'var(--success)' }}>● 0-50:</span> Good
                      </div>
                      <div>
                        <span style={{ color: 'var(--warning)' }}>● 51-100:</span> Moderate
                      </div>
                      <div>
                        <span style={{ color: '#FF9800' }}>● 101-150:</span> Unhealthy for Sensitive
                      </div>
                      <div>
                        <span style={{ color: 'var(--danger)' }}>● 151-200:</span> Unhealthy
                      </div>
                      <div>
                        <span style={{ color: '#9C27B0' }}>● 201-300:</span> Very Unhealthy
                      </div>
                      <div>
                        <span style={{ color: '#880E4F' }}>● 301+:</span> Hazardous
                      </div>
                    </div>
                    <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Last updated: {new Date(sensorData.timestamp).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Hub Information Card */}
            <div className="card">
              <div className="card-header">
                <div className="card-title-group">
                  <Activity size={24} />
                  <h3>HUB INFORMATION</h3>
                </div>
              </div>
              <div className="card-content">
                {hubDevice ? (
                  <>
                    <div className="info-grid">
                      <div className="info-item">
                        <span className="info-label">Device ID:</span>
                        <span className="info-value">{hubDevice.device_id}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Status:</span>
                        <span className={`info-value status-indicator ${statusClass}`}>
                          {hubDevice.online ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Type:</span>
                        <span className="info-value">{hubDevice.type}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">IP Address:</span>
                        <span className="info-value">{hubDevice.ip_address || 'N/A'}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Last Seen:</span>
                        <span className="info-value">
                          {hubDevice.last_seen ? new Date(hubDevice.last_seen).toLocaleString() : 'Never'}
                        </span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">WiFi Signal:</span>
                        <span className="info-value">
                          {hubDevice.wifi_rssi ? `${hubDevice.wifi_rssi} dBm` : 'N/A'}
                        </span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Uptime:</span>
                        <span className="info-value">
                          {hubDevice.uptime_ms ? `${Math.floor(hubDevice.uptime_ms / 3600000)}h ${Math.floor((hubDevice.uptime_ms % 3600000) / 60000)}m` : 'N/A'}
                        </span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Free Heap:</span>
                        <span className="info-value">
                          {hubDevice.free_heap ? `${(hubDevice.free_heap / 1024).toFixed(1)} KB` : 'N/A'}
                        </span>
                      </div>
                    </div>

                    <div className="action-buttons" style={{ marginTop: '20px' }}>
                      <button
                        className="btn-action"
                        onClick={handleRestart}
                        disabled={restarting || !hubDevice.online}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      >
                        {restarting ? (
                          <>
                            <RefreshCw size={18} className="rotating" />
                            <span>Restarting...</span>
                          </>
                        ) : (
                          <>
                            <Power size={18} />
                            <span>Restart Hub</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="no-alerts">
                    <p>No hub device found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
