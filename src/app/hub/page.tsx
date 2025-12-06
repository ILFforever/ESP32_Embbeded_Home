'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  getAllDevices,
  findHubDevice,
  getHubSensors,
  getHubAmpStreaming,
  getDeviceStatusClass,
  getDeviceStatusText,
  getAQICategory,
  getDeviceHistory,
  sendCommand,
  getSensorReadings,
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

  // Modal states for sensor graphs
  const [showTemperatureModal, setShowTemperatureModal] = useState(false);
  const [showHumidityModal, setShowHumidityModal] = useState(false);
  const [showAirQualityModal, setShowAirQualityModal] = useState(false);
  const [sensorHistory, setSensorHistory] = useState<any[]>([]);

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

  // Recent activity
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const devicesStatus = await getAllDevices();
        const hub = findHubDevice(devicesStatus.devices);

        if (hub) {
          console.log('🔍 Hub device found:', hub.device_id, 'Type:', hub.type);
          setHubDevice(hub);

          // Fetch hub activity history (same approach as doorbell)
          try {
            const history = await getDeviceHistory(hub.device_id, 20);
            if (history?.history) setRecentActivity(history.history);
          } catch (err) {
            console.error('Failed to fetch hub activity history:', err);
          }

          // Fetch sensor data using NEW API
          try {
            const sensors = await getHubSensors(hub.device_id);
            if (sensors) {
              setSensorData(sensors.sensors);
            }
          } catch (err) {
            console.error('Failed to fetch hub sensors:', err);
          }

          // Fetch amplifier streaming status using NEW API
          try {
            const streaming = await getHubAmpStreaming(hub.device_id);
            if (streaming) {
              setAmpStreaming(streaming.amplifier);
              setVolume(streaming.amplifier.volume_level || 10);
            }
          } catch (err) {
            console.error('Failed to fetch hub amplifier streaming:', err);
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
      await sendCommand(hubDevice.device_id, 'system_restart');
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
      console.log('🔍 Sending alert to hub device_id:', hubDevice.device_id);
      const result = await sendCommand(hubDevice.device_id, 'hub_alert', {
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
      await sendCommand(hubDevice.device_id, 'amp_play', { url: streamUrl });
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
      await sendCommand(hubDevice.device_id, 'amp_stop');
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
      await sendCommand(hubDevice.device_id, 'amp_restart');
      alert('Restart command sent to Hub amplifier!');
    } catch (error) {
      console.error('Error restarting amplifier:', error);
      alert('Failed to restart amplifier. Please try again.');
    } finally {
      setAmpLoading(false);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    // Update local state immediately for responsive UI
    setVolume(newVolume);
  };

  const handleVolumeSend = async (finalVolume: number) => {
    if (!hubDevice) return;

    // Send volume command to backend when user releases slider
    try {
      await sendCommand(hubDevice.device_id, 'amp_volume', { level: finalVolume });
      console.log(`Volume set to ${finalVolume}`);
    } catch (error) {
      console.error('Error setting volume:', error);
      alert('Failed to set volume. Please try again.');
    }
  };

  const handleMicToggle = async () => {
    if (!hubDevice) return;

    try {
      const action = micActive ? 'mic_stop' : 'mic_start';
      await sendCommand(hubDevice.device_id, action);
      setMicActive(!micActive);
    } catch (error) {
      console.error('Error toggling mic:', error);
      alert('Failed to toggle microphone');
    }
  };

  const getTemperatureStatus = (temp: number) => {
    if (temp < 25) return { text: 'Cold', color: '#4FC3F7', status: 'status-warning' };
    if (temp <= 30) return { text: 'Comfortable', color: 'var(--success)', status: 'status-online' };
    if (temp <= 40) return { text: 'Warm', color: 'var(--warning)', status: 'status-warning' };
    return { text: 'Hot', color: 'var(--danger)', status: 'status-offline' };
  };

  const getHumidityStatus = (humidity: number) => {
    if (humidity < 50) return { text: 'Dry', color: 'var(--warning)', status: 'status-warning' };
    if (humidity <= 65) return { text: 'Comfortable', color: 'var(--success)', status: 'status-online' };
    return { text: 'Humid', color: 'var(--warning)', status: 'status-warning' };
  };

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return 'Never';

    try {
      let date: Date;

      // Check if it's a Firestore Timestamp object with _seconds
      if (timestamp._seconds !== undefined) {
        date = new Date(timestamp._seconds * 1000);
      }
      // Check if it's already a Date object
      else if (timestamp instanceof Date) {
        date = timestamp;
      }
      // Check if it's a string or number
      else {
        date = new Date(timestamp);
      }

      // Validate the date
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }

      return date.toLocaleTimeString();
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return 'Invalid Date';
    }
  };

  // ---- Helper functions for Recent Activity ----
  const formatActivityTime = (timestamp: any) => {
    if (timestamp?.toDate) return timestamp.toDate().toLocaleTimeString();
    if (timestamp?._seconds) return new Date(timestamp._seconds * 1000).toLocaleTimeString();
    if (typeof timestamp === 'string' || typeof timestamp === 'number') return new Date(timestamp).toLocaleTimeString();
    return 'N/A';
  };

  const getActivityDescription = (event: any) => {
    if (!event) return 'Activity detected';
    if (event.type === 'sensor_update') return `Sensor update: ${Object.keys(event.data || {}).join(', ')}`;
    if (event.type === 'command') return `Command: ${event.data?.action || 'unknown'}`;
    if (event.type === 'heartbeat') return `Heartbeat (uptime ${Math.floor((event.data?.uptime_ms || 0) / 60000)}m)`;
    if (event.type === 'device_state') return `Device state: heap ${event.data?.free_heap ? Math.floor(event.data.free_heap / 1024) : 'N/A'} KB`;
    if (event.type === 'device_log') return event.data?.message || 'Log entry';
    return 'Activity detected';
  };

  const getActivityStatus = (event: any) => {
    if (!event) return 'Event';
    if (event.type === 'command') return event.data?.status || 'pending';
    if (event.type === 'heartbeat') return 'Active';
    if (event.type === 'device_state') return 'Online';
    if (event.type === 'device_log') return event.data?.level || 'INFO';
    return 'Event';
  };

  const getActivityStatusClass = (event: any) => {
    if (!event) return 'status-safe';
    if (event.type === 'command') {
      if (event.data?.status === 'completed') return 'status-safe';
      if (event.data?.status === 'failed') return 'status-danger';
      return 'status-warning';
    }
    if (event.type === 'device_log') {
      const lvl = event.data?.level?.toUpperCase() || 'INFO';
      if (lvl === 'ERROR' || lvl === 'CRITICAL') return 'status-danger';
      if (lvl === 'WARNING' || lvl === 'WARN') return 'status-warning';
      return 'status-safe';
    }
    if (event.type === 'device_state' || event.type === 'heartbeat') return 'status-safe';
    return 'status-safe';
  };

  const openSensorModal = async (sensorType: 'temperature' | 'humidity' | 'airquality') => {
    if (!hubDevice) return;

    try {
      // Fetch historical sensor readings (24 hours)
      const readings = await getSensorReadings(hubDevice.device_id, 24);
      if (readings?.readings) {
        setSensorHistory(readings.readings);
      }
    } catch (error) {
      console.error('Error fetching sensor history:', error);
      setSensorHistory([]);
    }

    // Open the appropriate modal
    switch (sensorType) {
      case 'temperature':
        setShowTemperatureModal(true);
        break;
      case 'humidity':
        setShowHumidityModal(true);
        break;
      case 'airquality':
        setShowAirQualityModal(true);
        break;
    }
  };

  const closeSensorModal = () => {
    setShowTemperatureModal(false);
    setShowHumidityModal(false);
    setShowAirQualityModal(false);
  };

  const prepareChartData = (dataKey: 'temperature' | 'humidity' | 'pm2_5' | 'aqi') => {
    return sensorHistory.map(reading => ({
      timestamp: new Date(reading.timestamp._seconds * 1000).toLocaleTimeString(),
      value: Number((reading[dataKey] ?? 0).toFixed(1))
    }));
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

  const statusClass = hubDevice ? getDeviceStatusClass(hubDevice.online, hubDevice.last_seen, hubDevice.type) : 'status-offline';
  const statusText = hubDevice ? getDeviceStatusText(hubDevice.online, hubDevice.last_seen, hubDevice.type) : 'OFFLINE';
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

          <div className="card control-card-large" style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>HUB SENSORS</h3>
              {sensorData?.timestamp && (
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Last updated: {formatTimestamp(sensorData.timestamp)}
                </span>
              )}
            </div>
            <div className="card-content">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                {/* Temperature Card (DHT11) */}
                <div className="card" style={{ cursor: 'pointer' }} onClick={() => openSensorModal('temperature')}>
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
                            margin: '20px 0',
                            height: '80px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {sensorData.temperature.toFixed(1)}°C
                        </div>
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                          <div className="temp-ranges" style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginTop: '85px',
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
                <div className="card" style={{ cursor: 'pointer' }} onClick={() => openSensorModal('humidity')}>
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
                            margin: '20px 0',
                            height: '80px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {sensorData.humidity.toFixed(1)}%
                        </div>
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
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
                            marginTop: '60px',
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
                <div className="card" style={{ cursor: 'pointer' }} onClick={() => openSensorModal('airquality')}>
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
                            margin: '20px 0',
                            height: '80px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {sensorData.pm25.toFixed(1)}
                        </div>
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
                          μg/m³
                        </div>
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                          {sensorData.aqi !== undefined && (
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-around',
                              marginTop: '26px',
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
              </div>
            </div>
          </div>

          <div className="control-page-grid">
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

            {/* Audio Control Card */}
            <div className="card">
              <div className="card-header">
                <div className="card-title-group">
                  <Volume2 size={24} />
                  <h3>AUDIO CONTROL</h3>
                </div>
                {ampStreaming && (
                  <span className={`status-indicator ${ampStreaming.is_playing ? 'status-online' : 'status-offline'}`}>
                    {ampStreaming.is_playing ? 'PLAYING' : 'STOPPED'}
                  </span>
                )}
              </div>
              <div className="card-content">
                <div style={{ pointerEvents: 'auto' }}>
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
                        onMouseUp={(e) => handleVolumeSend(parseInt((e.target as HTMLInputElement).value))}
                        onTouchEnd={(e) => handleVolumeSend(parseInt((e.target as HTMLInputElement).value))}
                        disabled={!hubDevice?.online}
                        style={{
                          width: '100%',
                          cursor: 'pointer'
                        }}
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

            {/* Container for Submodule Commands and Send Alert - Stacked vertically */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Submodule Command Card - Half Height */}
              <div className="card" style={{ height: 'fit-content' }}>
                <div className="card-header">
                  <div className="card-title-group">
                    <Activity size={24} />
                    <h3>SUBMODULE COMMANDS</h3>
                  </div>
                </div>
                <div className="card-content">
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

                  {/* RECENT ACTIVITY (Inserted as requested) */}
                  <div style={{ marginTop: 16 }} />

                  <div className="card-header" style={{ paddingTop: '8px' }}>
                    <h3>RECENT ACTIVITY</h3>
                  </div>

                  <div className="activity-list">
                    {recentActivity?.length > 0 ? (
                      recentActivity.map((event: any, index: number) => (
                        <div key={event.id || index} className="activity-item">
                          <span className="activity-time">{formatActivityTime(event.timestamp)}</span>
                          <span className="activity-desc">{getActivityDescription(event)}</span>
                          <span className={`activity-status ${getActivityStatusClass(event)}`}>
                            {getActivityStatus(event)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '20px',
                          color: '#6c757d',
                          fontSize: '14px',
                          fontStyle: 'italic',
                        }}
                      >
                        No recent activity
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Send Alert to Hub Card - Half Height (commented out) */}
            </div>

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
                        <span className="info-value">{hubDevice.device_id || 'N/A'}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Status:</span>
                        <span className={`info-value status-indicator ${statusClass}`}>
                          {hubDevice.online ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Type:</span>
                        <span className="info-value">{hubDevice.type || 'N/A'}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">IP Address:</span>
                        <span className="info-value">
                          {hubDevice.online ? (hubDevice.ip_address || 'N/A') : '-'}
                        </span>
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
                          {hubDevice.online ? (hubDevice.wifi_rssi ? `${hubDevice.wifi_rssi} dBm` : 'N/A') : '-'}
                        </span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Uptime:</span>
                        <span className="info-value">
                          {hubDevice.online ? (hubDevice.uptime_ms ? `${Math.floor(hubDevice.uptime_ms / 3600000)}h ${Math.floor((hubDevice.uptime_ms % 3600000) / 60000)}m` : 'N/A') : '-'}
                        </span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Free Heap:</span>
                        <span className="info-value">
                          {hubDevice.online ? (hubDevice.free_heap ? `${(hubDevice.free_heap / 1024).toFixed(1)} KB` : 'N/A') : '-'}
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

        {/* Temperature Modal */}
        {showTemperatureModal && (
          <div className="modal-overlay" onClick={closeSensorModal}>
            <button className="modal-close" onClick={closeSensorModal}>✕</button>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="card">
                <div className="card-header">
                  <div className="card-title-group">
                    <Thermometer size={24} />
                    <h3>TEMPERATURE HISTORY (24H)</h3>
                  </div>
                  {tempStatus && (
                    <span className={`status-indicator ${tempStatus.status}`}>
                      {tempStatus.text}
                    </span>
                  )}
                </div>
                <div className="card-content">
                  {sensorData?.temperature != null && (
                    <div className="room-details" style={{ marginBottom: '20px' }}>
                      <div className="detail-item">
                        <span className="detail-label">CURRENT:</span>
                        <span className="detail-value" style={{ color: tempStatus?.color }}>
                          {sensorData.temperature.toFixed(1)}°C
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">AVG (24H):</span>
                        <span className="detail-value">
                          {sensorHistory.length > 0
                            ? (sensorHistory.reduce((sum, r) => sum + (r.temperature ?? 0), 0) / sensorHistory.length).toFixed(1)
                            : sensorData.temperature.toFixed(1)}°C
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">COMFORT RANGE:</span>
                        <span className="detail-value">18-25°C</span>
                      </div>
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={prepareChartData('temperature')} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis
                        dataKey="timestamp"
                        stroke="#FFF"
                        tick={{ fill: '#FFF', fontFamily: 'monospace' }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        stroke="#FFF"
                        tick={{ fill: '#FFF', fontFamily: 'monospace' }}
                        label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', fill: '#FFF' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1a1a1a',
                          border: '2px solid #FF6600',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          textTransform: 'uppercase'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={tempStatus?.color || '#FF6600'}
                        strokeWidth={2}
                        dot={false}
                        activeDot={false}
                        connectNulls={true}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Humidity Modal */}
        {showHumidityModal && (
          <div className="modal-overlay" onClick={closeSensorModal}>
            <button className="modal-close" onClick={closeSensorModal}>✕</button>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="card">
                <div className="card-header">
                  <div className="card-title-group">
                    <Droplets size={24} />
                    <h3>HUMIDITY HISTORY (24H)</h3>
                  </div>
                  {humidityStatus && (
                    <span className={`status-indicator ${humidityStatus.status}`}>
                      {humidityStatus.text}
                    </span>
                  )}
                </div>
                <div className="card-content">
                  {sensorData?.humidity != null && (
                    <div className="room-details" style={{ marginBottom: '20px' }}>
                      <div className="detail-item">
                        <span className="detail-label">CURRENT:</span>
                        <span className="detail-value" style={{ color: humidityStatus?.color }}>
                          {sensorData.humidity.toFixed(1)}%
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">AVG (24H):</span>
                        <span className="detail-value">
                          {sensorHistory.length > 0
                            ? (sensorHistory.reduce((sum, r) => sum + (r.humidity ?? 0), 0) / sensorHistory.length).toFixed(1)
                            : sensorData.humidity.toFixed(1)}%
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">COMFORT RANGE:</span>
                        <span className="detail-value">30-60%</span>
                      </div>
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={prepareChartData('humidity')} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis
                        dataKey="timestamp"
                        stroke="#FFF"
                        tick={{ fill: '#FFF', fontFamily: 'monospace' }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        stroke="#FFF"
                        tick={{ fill: '#FFF', fontFamily: 'monospace' }}
                        label={{ value: 'Humidity (%)', angle: -90, position: 'insideLeft', fill: '#FFF' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1a1a1a',
                          border: '2px solid #4FC3F7',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          textTransform: 'uppercase'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={humidityStatus?.color || '#4FC3F7'}
                        strokeWidth={2}
                        dot={false}
                        activeDot={false}
                        connectNulls={true}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Air Quality Modal */}
        {showAirQualityModal && (
          <div className="modal-overlay" onClick={closeSensorModal}>
            <button className="modal-close" onClick={closeSensorModal}>✕</button>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="card">
                <div className="card-header">
                  <div className="card-title-group">
                    <Wind size={24} />
                    <h3>AIR QUALITY HISTORY (24H)</h3>
                  </div>
                  {aqiData && (
                    <span className={`status-indicator ${aqiData.status}`}>
                      {aqiData.category}
                    </span>
                  )}
                </div>
                <div className="card-content">
                  {sensorData?.pm25 != null && (
                    <div className="room-details" style={{ marginBottom: '20px' }}>
                      <div className="detail-item">
                        <span className="detail-label">CURRENT PM2.5:</span>
                        <span className="detail-value" style={{ color: aqiData?.color }}>
                          {sensorData.pm25.toFixed(1)} μg/m³
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">AQI:</span>
                        <span className="detail-value" style={{ color: aqiData?.color }}>
                          {sensorData.aqi}
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">AVG (24H):</span>
                        <span className="detail-value">
                          {sensorHistory.length > 0
                            ? (sensorHistory.reduce((sum, r) => sum + (r.pm2_5 ?? 0), 0) / sensorHistory.length).toFixed(1)
                            : sensorData.pm25.toFixed(1)} μg/m³
                        </span>
                      </div>
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={prepareChartData('pm2_5')} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis
                        dataKey="timestamp"
                        stroke="#FFF"
                        tick={{ fill: '#FFF', fontFamily: 'monospace' }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        stroke="#FFF"
                        tick={{ fill: '#FFF', fontFamily: 'monospace' }}
                        label={{ value: 'PM2.5 (μg/m³)', angle: -90, position: 'insideLeft', fill: '#FFF' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1a1a1a',
                          border: `2px solid ${aqiData?.color || '#00FF88'}`,
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          textTransform: 'uppercase'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={aqiData?.color || '#00FF88'}
                        strokeWidth={2}
                        dot={false}
                        activeDot={false}
                        connectNulls={true}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
