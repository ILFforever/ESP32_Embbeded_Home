'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import {
  getAllDevices,
  findHubDevice,
  getHubSensors,
  sendHubAlert,
  getHubAmpStreaming,
  playHubAmplifier,
  stopHubAmplifier,
  restartHubAmplifier,
  setHubAmplifierVolume,
  getHubAmplifierStatus,
  restartHubSystem,
  getDeviceStatusClass,
  getDeviceStatusText,
  getAQICategory,
  startMicrophone,
  stopMicrophone,
  getMicrophoneStatus
} from '@/services/devices.service';
import type { BackendDevice } from '@/types/dashboard';
import {
  Thermometer,
  Droplets,
  Wind,
  Activity,
  Power,
  RefreshCw,
  ArrowLeft,
  Volume2,
  Play,
  Square,
  AlertTriangle,
  Send,
  Mic,
  RotateCw
} from 'lucide-react';

export default function HubControlPage() {
  const router = useRouter();
  const [hubDevice, setHubDevice] = useState<BackendDevice | null>(null);
  const [sensorData, setSensorData] = useState<any | null>(null);
  const [ampStreaming, setAmpStreaming] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);

  // Alert form state
  const [alertMessage, setAlertMessage] = useState('');
  const [alertLevel, setAlertLevel] = useState<'info' | 'warning' | 'error' | 'critical'>('info');
  const [alertDuration, setAlertDuration] = useState(10);
  const [sendingAlert, setSendingAlert] = useState(false);

  // Amplifier state
  const [streamUrl, setStreamUrl] = useState('');
  const [volume, setVolume] = useState(10);
  const [ampLoading, setAmpLoading] = useState(false);

  // Microphone state
  const [micActive, setMicActive] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const devicesStatus = await getAllDevices();
        const hub = findHubDevice(devicesStatus.devices);

        if (hub) {
          setHubDevice(hub);

          // Fetch sensor data using NEW API
          const sensors = await getHubSensors(hub.device_id);
          if (sensors) {
            setSensorData(sensors.sensors);
          }

          // Fetch amplifier streaming status using NEW API
          const streaming = await getHubAmpStreaming(hub.device_id);
          if (streaming) {
            setAmpStreaming(streaming.amplifier);
            setVolume(streaming.amplifier.volume_level || 10);
          }
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
      await restartHubSystem(hubDevice.device_id);
      alert('Hub restart command sent successfully!');
    } catch (error) {
      console.error('Error restarting hub:', error);
      alert('Failed to restart hub. Please try again.');
    } finally {
      setRestarting(false);
    }
  };

  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hubDevice || !alertMessage.trim()) return;

    try {
      setSendingAlert(true);
      const result = await sendHubAlert(hubDevice.device_id, {
        message: alertMessage,
        level: alertLevel,
        duration: alertDuration
      });

      if (result) {
        alert(`Alert sent successfully! Command ID: ${result.command_id}`);
        setAlertMessage('');
      } else {
        alert('Failed to send alert. Please try again.');
      }
    } catch (error) {
      console.error('Error sending alert:', error);
      alert('Failed to send alert. Please try again.');
    } finally {
      setSendingAlert(false);
    }
  };

  const handlePlayStream = async () => {
    if (!hubDevice || !streamUrl.trim()) return;

    try {
      setAmpLoading(true);
      await playHubAmplifier(hubDevice.device_id, streamUrl);
      alert('Play command sent to Hub amplifier!');
    } catch (error) {
      console.error('Error playing stream:', error);
      alert('Failed to play stream. Please try again.');
    } finally {
      setAmpLoading(false);
    }
  };

  const handleStopStream = async () => {
    if (!hubDevice) return;

    try {
      setAmpLoading(true);
      await stopHubAmplifier(hubDevice.device_id);
      alert('Stop command sent to Hub amplifier!');
    } catch (error) {
      console.error('Error stopping stream:', error);
      alert('Failed to stop stream. Please try again.');
    } finally {
      setAmpLoading(false);
    }
  };

  const handleRestartAmp = async () => {
    if (!hubDevice) return;

    try {
      setAmpLoading(true);
      await restartHubAmplifier(hubDevice.device_id);
      alert('Restart command sent to Hub amplifier!');
    } catch (error) {
      console.error('Error restarting amplifier:', error);
      alert('Failed to restart amplifier. Please try again.');
    } finally {
      setAmpLoading(false);
    }
  };

  const handleVolumeChange = async (newVolume: number) => {
    if (!hubDevice) return;

    try {
      setVolume(newVolume);
      await setHubAmplifierVolume(hubDevice.device_id, newVolume);
    } catch (error) {
      console.error('Error setting volume:', error);
      alert('Failed to set volume. Please try again.');
    }
  };

  const handleMicToggle = async () => {
    if (!hubDevice) return;

    try {
      if (micActive) {
        await stopMicrophone(hubDevice.device_id);
      } else {
        await startMicrophone(hubDevice.device_id);
      }
      setMicActive(!micActive);
    } catch (error) {
      console.error('Error toggling mic:', error);
      alert('Failed to toggle microphone');
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
  const tempStatus = sensorData?.temperature != null ? getTemperatureStatus(sensorData.temperature) : null;
  const humidityStatus = sensorData?.humidity != null ? getHumidityStatus(sensorData.humidity) : null;
  const aqiData = sensorData?.aqi ? getAQICategory(sensorData.aqi) : null;

  return (
    <ProtectedRoute>
      <div className="main-content" style={{ marginLeft: 0 }}>
        <div className="dashboard-container">
          <header className="dashboard-header">
            <div className="dashboard-header-left">
              <button className="sidebar-toggle" onClick={() => router.push('/dashboard')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Back to Dashboard">
                <ArrowLeft size={20} />
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
            {/* Hub Information Card - Spans 2 rows */}
            <div className="card" style={{ gridRow: 'span 2' }}>
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
                {sensorData?.temperature != null ? (
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
                      {sensorData.temperature.toFixed(1)}°C
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
                {sensorData?.humidity != null ? (
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
                      {sensorData.humidity.toFixed(1)}%
                    </div>
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <p style={{ fontSize: '14px', marginBottom: '8px' }}>
                        Last updated: {new Date(sensorData.timestamp).toLocaleTimeString()}
                      </p>
                      <div className="progress-bar" style={{ marginTop: '16px' }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: `${Math.min(sensorData.humidity, 100)}%`,
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
            <div className="card">
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
                {sensorData?.pm25 != null ? (
                  <>
                    <div
                      className="card-value"
                      style={{
                        fontSize: '56px',
                        color: aqiData?.color,
                        textAlign: 'center',
                        margin: '20px 0'
                      }}
                    >
                      {sensorData.pm25.toFixed(1)}
                    </div>
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
                      μg/m³
                    </div>
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <p style={{ fontSize: '14px', marginBottom: '8px' }}>
                        Last updated: {new Date(sensorData.timestamp).toLocaleTimeString()}
                      </p>
                      {sensorData.aqi !== undefined && (
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-around',
                          marginTop: '16px',
                          padding: '12px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: '8px'
                        }}>
                          <div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>AQI</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: aqiData?.color }}>{sensorData.aqi}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Category</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{aqiData?.category}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="no-alerts">
                    <Activity size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                    <p>No air quality data available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Microphone Control Card */}
            <div className="card">
              <div className="card-header">
                <div className="card-title-group">
                  <Mic size={24} />
                  <h3>MICROPHONE CONTROL</h3>
                </div>
              </div>
              <div className="card-content">
                <div className="control-panel">
                  <div className="control-status">
                    <Mic
                      size={48}
                      className={
                        micActive
                          ? "status-active-large"
                          : "status-inactive-large"
                      }
                    />
                    <div className="status-label">
                      <span className="status-text">
                        {micActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                      <span className="status-description">
                        {micActive
                          ? "Microphone is listening"
                          : "Microphone is muted"}
                      </span>
                    </div>
                  </div>
                  <button
                    className={`btn-control ${
                      micActive ? "btn-stop" : "btn-start"
                    }`}
                    onClick={handleMicToggle}
                    disabled={!hubDevice?.online}
                    style={{ marginTop: "12px" }}
                  >
                    {micActive ? "STOP MIC" : "START MIC"}
                  </button>
                </div>
              </div>
            </div>

            {/* Amplifier Control Card */}
            <div className="card">
              <div className="card-header">
                <div className="card-title-group">
                  <Volume2 size={24} />
                  <h3>AMPLIFIER CONTROL</h3>
                </div>
                {ampStreaming && (
                  <span className={`status-indicator ${ampStreaming.is_playing ? 'status-online' : 'status-offline'}`}>
                    {ampStreaming.is_playing ? 'PLAYING' : 'STOPPED'}
                  </span>
                )}
              </div>
              <div className="card-content">
                <div className="control-panel">
                  <div className="control-status">
                    <Volume2 size={48} className="status-info-large" />
                    <div className="status-label">
                      <span className="status-text">AMPLIFIER</span>
                      <span className="status-description">
                        Stream audio to amplifier
                      </span>
                    </div>
                  </div>
                  {ampStreaming && ampStreaming.is_streaming && ampStreaming.current_url && (
                    <div style={{
                      marginTop: '12px',
                      padding: '12px',
                      background: 'rgba(0,255,136,0.1)',
                      border: '1px solid var(--success)',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}>
                      <div style={{ color: 'var(--success)', marginBottom: '4px' }}>Now Streaming:</div>
                      <div style={{ color: '#FFF', wordBreak: 'break-all' }}>{ampStreaming.current_url}</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Stream URL
                      </label>
                      <input
                        type="url"
                        value={streamUrl}
                        onChange={(e) => setStreamUrl(e.target.value)}
                        placeholder="http://stream.url/audio.mp3"
                        disabled={!hubDevice?.online}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(var(--primary-color-rgb), 0.3)',
                          borderRadius: '4px',
                          color: '#FFF',
                          fontSize: '14px'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Volume: {volume} / 21
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={21}
                        value={volume}
                        onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                        disabled={!hubDevice?.online || ampLoading}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                      <button
                        className="btn-action"
                        onClick={handlePlayStream}
                        disabled={ampLoading || !hubDevice?.online || !streamUrl.trim()}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      >
                        <Play size={18} />
                        <span>Play</span>
                      </button>
                      <button
                        className="btn-action"
                        onClick={handleStopStream}
                        disabled={ampLoading || !hubDevice?.online}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      >
                        <Square size={18} />
                        <span>Stop</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Submodule Command Card */}
            <div className="card">
              <div className="card-header">
                <div className="card-title-group">
                  <Activity size={24} />
                  <h3>SUBMODULE COMMANDS</h3>
                </div>
              </div>
              <div className="card-content">
                <div className="control-panel">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        background: 'linear-gradient(135deg, rgba(243, 33, 33, 0.1) 0%, rgba(192, 44, 21, 0.1) 100%)',
                        borderRadius: '8px',
                        border: '1px solid rgba(243, 79, 33, 0.3)',
                      }}
                    >
                      <Volume2
                        size={32}
                        className="status-info-large"
                        style={{ flexShrink: 0 }}
                      />
                      <button
                        className="btn-control"
                        onClick={handleRestartAmp}
                        disabled={ampLoading || !hubDevice?.online}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          flex: 1,
                          fontWeight: 'bold',
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#fff',
                        }}
                      >
                        <RotateCw
                          size={18}
                          className={ampLoading ? 'rotating' : ''}
                        />
                        {ampLoading ? 'RESTARTING...' : 'RESTART AMPLIFIER'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Send Alert to Hub Card */}
            <div className="card">
              <div className="card-header">
                <div className="card-title-group">
                  <AlertTriangle size={24} />
                  <h3>SEND ALERT TO HUB</h3>
                </div>
              </div>
              <div className="card-content">
                <form onSubmit={handleSendAlert} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                      Alert Message
                    </label>
                    <input
                      type="text"
                      value={alertMessage}
                      onChange={(e) => setAlertMessage(e.target.value)}
                      placeholder="Enter alert message..."
                      maxLength={200}
                      required
                      disabled={!hubDevice?.online}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(var(--primary-color-rgb), 0.3)',
                        borderRadius: '4px',
                        color: '#FFF',
                        fontSize: '14px'
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Level
                      </label>
                      <select
                        value={alertLevel}
                        onChange={(e) => setAlertLevel(e.target.value as any)}
                        disabled={!hubDevice?.online}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(var(--primary-color-rgb), 0.3)',
                          borderRadius: '4px',
                          color: '#FFF',
                          fontSize: '14px'
                        }}
                      >
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="error">Error</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Duration (seconds)
                      </label>
                      <input
                        type="number"
                        value={alertDuration}
                        onChange={(e) => setAlertDuration(parseInt(e.target.value))}
                        min={1}
                        max={300}
                        disabled={!hubDevice?.online}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(var(--primary-color-rgb), 0.3)',
                          borderRadius: '4px',
                          color: '#FFF',
                          fontSize: '14px'
                        }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-action"
                    disabled={sendingAlert || !hubDevice?.online || !alertMessage.trim()}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <Send size={18} />
                    <span>{sendingAlert ? 'Sending...' : 'Send Alert'}</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
