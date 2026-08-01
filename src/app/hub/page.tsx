'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getAllDevices,
  findHubDevice,
  getHubSensors,
  getHubAmpStreaming,
  getDeviceStatusText,
  getAQICategory,
  getDeviceHistory,
  sendCommand,
  getSensorReadings,
} from '@/services/devices.service';
import type { BackendDevice } from '@/types/dashboard';
import { notify, confirmDialog } from '@/components/glass/GlassRuntime';
import { relativeTime } from '@/utils/time';
import {
  ArrowLeft,
  Mic,
  Moon,
  Play,
  Power,
  RefreshCw,
  RotateCw,
  Send,
  Square,
  Sun,
  X,
} from 'lucide-react';

type SensorKind = 'temperature' | 'humidity' | 'airquality';
type Tone = 'ok' | 'warn' | 'crit' | 'off';

const buttonGroupStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
  gap: 'var(--s-2)',
};

const sensorIconStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  flex: 'none',
  display: 'grid',
  placeItems: 'center',
};

const modalNarrowStyle: React.CSSProperties = {
  width: 'min(100%, 480px)',
};

const sliderPaint = (value: number, max = 100) =>
  `linear-gradient(to right, var(--accent) 0 ${(value / max) * 100}%, var(--sunken) ${(value / max) * 100}% 100%)`;

const formatTimestamp = (timestamp: any): string => {
  if (!timestamp) return 'Never';

  try {
    let date: Date;
    if (timestamp._seconds !== undefined) {
      date = new Date(timestamp._seconds * 1000);
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }

    if (Number.isNaN(date.getTime())) return 'Invalid date';
    return relativeTime(date);
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return 'Invalid date';
  }
};

const formatDateTime = (timestamp: any): string => {
  if (!timestamp) return 'Never';
  try {
    const date = timestamp._seconds
      ? new Date(timestamp._seconds * 1000)
      : new Date(timestamp);
    return Number.isNaN(date.getTime()) ? 'Invalid date' : relativeTime(date);
  } catch {
    return 'Invalid date';
  }
};

const formatUptime = (uptimeMs?: number) => {
  if (!uptimeMs) return 'N/A';
  const hours = Math.floor(uptimeMs / 3600000);
  const minutes = Math.floor((uptimeMs % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
};

const metricText = (value: number | null | undefined, suffix = '', digits = 1) =>
  value == null ? 'N/A' : `${value.toFixed(digits)}${suffix}`;

const getTemperatureStatus = (temp: number): { text: string; tone: Tone } => {
  if (temp < 25) return { text: 'Cold', tone: 'warn' };
  if (temp <= 30) return { text: 'Comfortable', tone: 'ok' };
  if (temp <= 40) return { text: 'Warm', tone: 'warn' };
  return { text: 'Hot', tone: 'crit' };
};

const getHumidityStatus = (humidity: number): { text: string; tone: Tone } => {
  if (humidity < 50) return { text: 'Dry', tone: 'warn' };
  if (humidity <= 65) return { text: 'Comfortable', tone: 'ok' };
  return { text: 'Humid', tone: 'warn' };
};

const chipClass = (tone: Tone) => {
  if (tone === 'ok') return 'g-chip g-chip--ok';
  if (tone === 'warn') return 'g-chip g-chip--warn';
  if (tone === 'crit') return 'g-chip g-chip--crit';
  return 'g-chip';
};

const toneClass = (tone: Tone) => {
  if (tone === 'ok') return 'is-ok';
  if (tone === 'warn') return 'is-warn';
  if (tone === 'crit') return 'is-crit';
  return '';
};

const dotClass = (tone: Tone) => {
  if (tone === 'ok') return 'g-dot g-dot--ok';
  if (tone === 'warn') return 'g-dot g-dot--warn';
  if (tone === 'crit') return 'g-dot g-dot--crit';
  return 'g-dot g-dot--off';
};

const activityTone = (event: any): Tone => {
  if (!event) return 'ok';
  if (event.type === 'command') {
    if (event.data?.status === 'failed') return 'crit';
    if (event.data?.status === 'completed') return 'ok';
    return 'warn';
  }
  if (event.type === 'device_log') {
    const level = event.data?.level?.toUpperCase() || 'INFO';
    if (level === 'ERROR' || level === 'CRITICAL') return 'crit';
    if (level === 'WARNING' || level === 'WARN') return 'warn';
  }
  if (event.type === 'heartbeat' || event.type === 'device_state' || event.type === 'sensor_update') return 'ok';
  return 'off';
};

const getActivityDescription = (event: any) => {
  if (!event) return 'Activity detected';
  if (event.type === 'sensor_update') return `Sensor update - ${Object.keys(event.data || {}).join(', ') || 'hub readings'}`;
  if (event.type === 'command') return `Command - ${event.data?.action || 'unknown action'}`;
  if (event.type === 'heartbeat') return `Heartbeat - up ${Math.floor((event.data?.uptime_ms || 0) / 60000)}m`;
  if (event.type === 'device_state') return `Device state - heap ${event.data?.free_heap ? Math.floor(event.data.free_heap / 1024) : 'N/A'} KB`;
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

const average = (values: number[]) => {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const range = (values: number[]) => {
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
};

const historyValue = (reading: any, dataKey: 'temperature' | 'humidity' | 'pm2_5' | 'aqi') => {
  if (dataKey === 'pm2_5') return reading.pm2_5 ?? reading.pm25;
  return reading[dataKey];
};

export default function HubControlPage() {
  const router = useRouter();
  const [hubDevice, setHubDevice] = useState<BackendDevice | null>(null);
  const [sensorData, setSensorData] = useState<any | null>(null);
  const [ampStreaming, setAmpStreaming] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);

  const [showTemperatureModal, setShowTemperatureModal] = useState(false);
  const [showHumidityModal, setShowHumidityModal] = useState(false);
  const [showAirQualityModal, setShowAirQualityModal] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [sensorHistory, setSensorHistory] = useState<any[]>([]);

  const [alertMessage, setAlertMessage] = useState('');
  const [alertLevel, setAlertLevel] = useState<'info' | 'warning' | 'error' | 'critical'>('info');
  const [alertDuration, setAlertDuration] = useState(10);
  const [sendingAlert, setSendingAlert] = useState(false);

  const [streamUrl, setStreamUrl] = useState('');
  const [volume, setVolume] = useState(10);
  const [ampLoading, setAmpLoading] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const devicesStatus = await getAllDevices();
        const hub = findHubDevice(devicesStatus.devices);

        if (hub) {
          console.log('Hub device found:', hub.device_id, 'Type:', hub.type);
          setHubDevice(hub);

          try {
            const history = await getDeviceHistory(hub.device_id, 20);
            if (history?.history) setRecentActivity(history.history);
          } catch (err) {
            console.error('Failed to fetch hub activity history:', err);
          }

          try {
            const sensors = await getHubSensors(hub.device_id);
            if (sensors) setSensorData(sensors.sensors);
          } catch (err) {
            console.error('Failed to fetch hub sensors:', err);
          }

          try {
            const streaming = await getHubAmpStreaming(hub.device_id);
            if (streaming?.amplifier) {
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
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const closeSensorModal = () => {
    setShowTemperatureModal(false);
    setShowHumidityModal(false);
    setShowAirQualityModal(false);
  };

  const closeAllModals = () => {
    closeSensorModal();
    setShowRestartModal(false);
    setShowAlertModal(false);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAllModals();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  const handleRestart = async () => {
    if (!hubDevice) return;

    try {
      setRestarting(true);
      await sendCommand(hubDevice.device_id, 'system_restart');
      setShowRestartModal(false);
      void notify('Hub restart command sent successfully!');
    } catch (error) {
      console.error('Error restarting hub:', error);
      void notify('Failed to restart hub. Please try again.');
    } finally {
      setRestarting(false);
    }
  };

  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hubDevice || !alertMessage.trim()) return;

    try {
      setSendingAlert(true);
      console.log('Sending alert to hub device_id:', hubDevice.device_id);
      const result = await sendCommand(hubDevice.device_id, 'hub_alert', {
        message: alertMessage,
        level: alertLevel,
        duration: alertDuration,
      });

      if (result) {
        void notify(`Alert sent successfully! Command ID: ${result.command_id}`);
        setAlertMessage('');
        setShowAlertModal(false);
      } else {
        void notify('Failed to send alert. Please try again.');
      }
    } catch (error) {
      console.error('Error sending alert:', error);
      void notify('Failed to send alert. Please try again.');
    } finally {
      setSendingAlert(false);
    }
  };

  const handlePlayStream = async () => {
    if (!hubDevice || !streamUrl.trim()) return;

    try {
      setAmpLoading(true);
      await sendCommand(hubDevice.device_id, 'amp_play', { url: streamUrl });
      void notify('Play command sent to Hub amplifier!');
    } catch (error) {
      console.error('Error playing stream:', error);
      void notify('Failed to play stream. Please try again.');
    } finally {
      setAmpLoading(false);
    }
  };

  const handleStopStream = async () => {
    if (!hubDevice) return;

    try {
      setAmpLoading(true);
      await sendCommand(hubDevice.device_id, 'amp_stop');
      void notify('Stop command sent to Hub amplifier!');
    } catch (error) {
      console.error('Error stopping stream:', error);
      void notify('Failed to stop stream. Please try again.');
    } finally {
      setAmpLoading(false);
    }
  };

  const handleRestartAmp = async () => {
    if (!hubDevice) return;

    try {
      setAmpLoading(true);
      await sendCommand(hubDevice.device_id, 'amp_restart');
      void notify('Restart command sent to Hub amplifier!');
    } catch (error) {
      console.error('Error restarting amplifier:', error);
      void notify('Failed to restart amplifier. Please try again.');
    } finally {
      setAmpLoading(false);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
  };

  const handleVolumeSend = async (finalVolume: number) => {
    if (!hubDevice) return;

    try {
      await sendCommand(hubDevice.device_id, 'amp_volume', { level: finalVolume });
      console.log(`Volume set to ${finalVolume}`);
    } catch (error) {
      console.error('Error setting volume:', error);
      void notify('Failed to set volume. Please try again.');
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
      void notify('Failed to toggle microphone');
    }
  };

  const openSensorModal = async (sensorType: SensorKind) => {
    if (!hubDevice) return;

    try {
      const readings = await getSensorReadings(hubDevice.device_id, 24);
      if (readings?.readings) setSensorHistory(readings.readings);
    } catch (error) {
      console.error('Error fetching sensor history:', error);
      setSensorHistory([]);
    }

    if (sensorType === 'temperature') setShowTemperatureModal(true);
    if (sensorType === 'humidity') setShowHumidityModal(true);
    if (sensorType === 'airquality') setShowAirQualityModal(true);
  };

  const prepareChartData = (dataKey: 'temperature' | 'humidity' | 'pm2_5' | 'aqi') =>
    sensorHistory.map((reading) => ({
      timestamp: formatTimestamp(reading.timestamp),
      value: Number((historyValue(reading, dataKey) ?? 0).toFixed(1)),
    }));

  const tempStatus = sensorData?.temperature != null ? getTemperatureStatus(sensorData.temperature) : null;
  const humidityStatus = sensorData?.humidity != null ? getHumidityStatus(sensorData.humidity) : null;
  const aqiData = sensorData?.aqi ? getAQICategory(sensorData.aqi) : null;
  const airTone: Tone = sensorData?.aqi == null ? 'off' : sensorData.aqi > 150 ? 'crit' : sensorData.aqi > 50 ? 'warn' : 'ok';
  const statusText = hubDevice ? getDeviceStatusText(hubDevice.online, hubDevice.last_seen, hubDevice.type) : 'Offline';
  const onlineTone: Tone = hubDevice?.online ? 'ok' : 'off';

  const temperatureHistory = useMemo(() => sensorHistory.map((r) => historyValue(r, 'temperature')).filter((v) => typeof v === 'number'), [sensorHistory]);
  const humidityHistory = useMemo(() => sensorHistory.map((r) => historyValue(r, 'humidity')).filter((v) => typeof v === 'number'), [sensorHistory]);
  const airHistory = useMemo(() => sensorHistory.map((r) => historyValue(r, 'pm2_5')).filter((v) => typeof v === 'number'), [sensorHistory]);

  const currentUrl = ampStreaming?.current_url || '';
  const isPlaying = Boolean(ampStreaming?.is_playing || ampStreaming?.is_streaming);

  const renderToolbar = () => (
    <div className="g-pane g-bar">
      <button className="g-back" type="button" onClick={() => router.push('/dashboard')}>
        <ArrowLeft size={16} strokeWidth={1.8} />
        Home
      </button>
      <span className="g-bar__brand">Hub</span>
      <div className="g-spacer" />
      <button className="g-theme" type="button" aria-label="Switch between light and dark" title="Switch theme">
        <Moon className="g-theme__moon" size={16} strokeWidth={1.7} />
        <Sun className="g-theme__sun" size={16} strokeWidth={1.7} />
      </button>
      <span className={`g-pill ${onlineTone === 'ok' ? '' : 'is-off'}`}>
        <i />
        {statusText}
      </span>
    </div>
  );

  const renderEmpty = (title: string, copy: string) => (
    <div className="g-empty">
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );

const renderSensorCard = (
    kind: SensorKind,
    title: string,
    status: { text: string; tone: Tone } | null,
    value: string,
    unit: string,
    detail: string,
  ) => (
    <button className={`g-pane g-card hub-sensor ${status ? toneClass(status.tone) : ''}`} type="button" onClick={() => openSensorModal(kind)}>
      <header>
        <h3>{title}</h3>
        <span className={status ? chipClass(status.tone) : 'g-chip'}>{status?.text || 'No reading'}</span>
      </header>
      <div className="g-metric-lg g-num">
        {value}
        {unit && <sup>{unit}</sup>}
      </div>
      <p className="g-sub">{detail}</p>
      {kind === 'humidity' ? (
        <>
          <div className="g-meter" style={{ marginTop: 'var(--s-5)' }}>
            <i className={status?.tone === 'warn' ? 'is-warn' : status?.tone === 'crit' ? 'is-crit' : ''} style={{ width: `${Math.min(sensorData?.humidity || 0, 100)}%` }} />
            <span className="g-meter__limit" style={{ left: '60%' }} />
          </div>
          <p className="g-sub">Limit marker at 60%</p>
        </>
      ) : (
        <svg
          className={`g-spark ${kind === 'airquality' ? 'g-spark--warn' : ''}`}
          viewBox="0 0 240 56"
          role="img"
          aria-label={`${title} trend preview`}
        >
          <defs>
            <linearGradient id={`hub-${kind}-spark`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={kind === 'airquality' ? 0.3 : 0.26} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            className="g-spark__area"
            d={
              kind === 'airquality'
                ? 'M0,46 L26,44 L52,45 L78,38 L104,36 L130,29 L156,26 L182,20 L208,17 L236,12 L240,12 L240,56 L0,56 Z'
                : 'M0,44 L26,42 L52,47 L78,39 L104,33 L130,30 L156,23 L182,26 L208,18 L236,15 L240,15 L240,56 L0,56 Z'
            }
            fill={`url(#hub-${kind}-spark)`}
          />
          <polyline
            className="g-spark__line"
            points={
              kind === 'airquality'
                ? '0,46 26,44 52,45 78,38 104,36 130,29 156,26 182,20 208,17 236,12'
                : '0,44 26,42 52,47 78,39 104,33 130,30 156,23 182,26 208,18 236,15'
            }
          />
          <circle cx="236" cy={kind === 'airquality' ? 12 : 15} r="4" className="g-spark__dot" />
        </svg>
      )}
    </button>
  );

  const renderChart = (
    dataKey: 'temperature' | 'humidity' | 'pm2_5',
    ariaLabel: string,
    warn = false,
  ) => (
    <div role="img" aria-label={ariaLabel}>
      {sensorHistory.length ? (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={prepareChartData(dataKey)} margin={{ top: 16, right: 18, left: 0, bottom: 16 }}>
            <CartesianGrid stroke="var(--hairline)" strokeDasharray="5 4" vertical={false} />
            <XAxis
              dataKey="timestamp"
              stroke="var(--ink-3)"
              tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="var(--ink-3)"
              tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 11 }}
              width={44}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--modal-bg)',
                border: '1px solid var(--outline)',
                borderRadius: 'var(--r-field)',
                color: 'var(--ink)',
                fontFamily: 'var(--mono)',
              }}
              labelStyle={{ color: 'var(--ink-2)' }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={warn ? 'var(--warn)' : 'var(--accent)'}
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4.5, strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        renderEmpty('No 24h history yet', 'Open this again after the hub reports more sensor samples.')
      )}
    </div>
  );

  const renderSensorModal = (
    open: boolean,
    title: string,
    subtitle: string,
    current: string,
    avg: string,
    rangeText: string,
    chartKey: 'temperature' | 'humidity' | 'pm2_5',
    warn = false,
  ) => {
    if (!open) return null;

    return (
      <div className="g-modal" role="dialog" aria-modal="true" onClick={closeSensorModal}>
        <div className="g-pane g-modal__card g-modal__card--wide" onClick={(event) => event.stopPropagation()}>
          <div className="g-modal__head">
            <div>
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>
            <button className="g-icon-btn" type="button" onClick={closeSensorModal} aria-label="Close">
              <X size={15} strokeWidth={2} />
            </button>
          </div>
          <div className="g-grid g-grid--3" style={{ marginBottom: 'var(--s-5)' }}>
            <div className={`g-tile ${warn ? 'is-warn' : ''}`}>
              <p className="g-label">Now</p>
              <div className="g-metric-sm g-num">{current}</div>
            </div>
            <div className="g-tile">
              <p className="g-label">24h average</p>
              <div className="g-metric-sm g-num">{avg}</div>
            </div>
            <div className="g-tile">
              <p className="g-label">Range</p>
              <div className="g-metric-sm g-num">{rangeText}</div>
            </div>
          </div>
          {renderChart(chartKey, `${title} chart over the last 24 hours`, warn)}
        </div>
      </div>
    );
  };

  const tempAvg = average(temperatureHistory);
  const tempRange = range(temperatureHistory);
  const humAvg = average(humidityHistory);
  const humRange = range(humidityHistory);
  const airAvg = average(airHistory);
  const airRange = range(airHistory);

  return (
    <ProtectedRoute>
      <main className="g-page">
        {renderToolbar()}

        <div className="g-title">
          <h1>Hub display</h1>
          <p>
            Living room · reading three sensors
            {sensorData?.timestamp ? ` · last update ${formatTimestamp(sensorData.timestamp)}` : ''}
          </p>
        </div>

        {loading ? (
          <section className="g-pane g-card">{renderEmpty('Loading hub data', 'Fetching sensors, amplifier state, and recent activity.')}</section>
        ) : (
          <>
            <section className="hub-sensors">
              {renderSensorCard(
                'temperature',
                'Temperature',
                tempStatus,
                sensorData?.temperature != null ? sensorData.temperature.toFixed(1) : 'N/A',
                sensorData?.temperature != null ? '°C' : '',
                'Comfort range 18-25 °C · DHT11',
              )}
              {renderSensorCard(
                'humidity',
                'Humidity',
                humidityStatus,
                sensorData?.humidity != null ? sensorData.humidity.toFixed(1) : 'N/A',
                sensorData?.humidity != null ? '%' : '',
                'Comfort range 30-60% · DHT11',
              )}
              {renderSensorCard(
                'airquality',
                'Air quality',
                sensorData?.pm25 != null ? { text: aqiData?.category || 'Measured', tone: airTone } : null,
                sensorData?.pm25 != null ? sensorData.pm25.toFixed(1) : 'N/A',
                sensorData?.pm25 != null ? 'µg/m³' : '',
                sensorData?.aqi != null ? `PM2.5 · AQI ${sensorData.aqi}` : 'PM2.5 · waiting for AQI',
              )}
            </section>

            <section className="hub-grid">
              <section className="g-pane g-card hub-a-mic">
                <header>
                  <h2>Microphone</h2>
                  <span className="g-label">mic</span>
                </header>
                <div className="g-row g-row--between">
                  <div className="g-row">
                    <span style={sensorIconStyle}>
                      <Mic size={22} strokeWidth={1.8} />
                    </span>
                    <div>
                      <div>{micActive ? 'Listening' : 'Muted'}</div>
                      <p className="g-sub" style={{ margin: 0 }}>
                        {micActive ? 'Streaming to the hub speaker' : 'Microphone stream is stopped'}
                      </p>
                    </div>
                  </div>
                  <button
                    className="g-switch"
                    type="button"
                    aria-pressed={micActive}
                    aria-label="Microphone"
                    onClick={handleMicToggle}
                    disabled={!hubDevice?.online}
                  />
                </div>
              </section>

              <section className="g-pane g-card hub-a-audio">
                <header>
                  <h2>Amplifier</h2>
                  <span className={isPlaying ? 'g-chip g-chip--ok' : 'g-chip'}>{isPlaying ? 'Playing' : 'Stopped'}</span>
                </header>

                <div className="g-tile" style={{ marginBottom: 'var(--s-4)' }}>
                  <p className="g-label">Now streaming</p>
                  <p className="g-mono" style={{ margin: '6px 0 0', overflowWrap: 'anywhere' }}>
                    {currentUrl || 'No stream selected'}
                  </p>
                </div>

                <div className="g-stack">
                  <div className="g-field g-field--mono">
                    <label htmlFor="stream-url">Stream URL</label>
                    <div className="g-input-group">
                      <input
                        id="stream-url"
                        type="text"
                        value={streamUrl}
                        onChange={(event) => setStreamUrl(event.target.value)}
                        placeholder="Stream URL"
                        disabled={!hubDevice?.online}
                      />
                      <select
                        aria-label="Preset station"
                        value=""
                        onChange={(event) => setStreamUrl(event.target.value)}
                        disabled={!hubDevice?.online}
                      >
                        <option value="">Preset</option>
                        <option value="https://stream.live.vc.bbcmedia.co.uk/bbc_world_service_east_asia">BBC World Service</option>
                        <option value="https://play.streamafrica.net/japancitypop">Japan City Pop</option>
                        <option value="http://stream.radioparadise.com/aac-128">Radio Paradise</option>
                      </select>
                    </div>
                  </div>

                  <div className="g-field">
                    <label htmlFor="volume">Volume · {volume} of 21</label>
                    <input
                      id="volume"
                      className="g-slider"
                      type="range"
                      min={0}
                      max={21}
                      value={volume}
                      onChange={(event) => handleVolumeChange(Number(event.target.value))}
                      onMouseUp={(event) => handleVolumeSend(Number((event.target as HTMLInputElement).value))}
                      onTouchEnd={(event) => handleVolumeSend(Number((event.target as HTMLInputElement).value))}
                      disabled={!hubDevice?.online}
                      style={{ backgroundImage: sliderPaint(volume, 21) }}
                    />
                  </div>

                  <div style={buttonGroupStyle}>
                    <button className="g-btn g-btn--primary" type="button" onClick={handlePlayStream} disabled={ampLoading || !hubDevice?.online || !streamUrl.trim()}>
                      <Play size={16} />
                      Play
                    </button>
                    <button className="g-btn g-btn--ghost" type="button" onClick={handleStopStream} disabled={ampLoading || !hubDevice?.online}>
                      <Square size={16} />
                      Stop
                    </button>
                    <button className="g-btn g-btn--ghost" type="button" onClick={handleRestartAmp} disabled={ampLoading || !hubDevice?.online}>
                      <RotateCw size={16} className={ampLoading ? 'rotating' : ''} />
                      Restart
                    </button>
                  </div>
                </div>
              </section>

              <section className="g-pane g-card hub-a-activity">
                <header>
                  <h2>Recent activity</h2>
                  <span className="g-label">last 20</span>
                </header>
                {recentActivity.length > 0 ? (
                  <div className="g-list">
                    {recentActivity.slice(0, 5).map((event, index) => (
                      <div className="g-list__row" key={event.id || index}>
                        <i className={dotClass(activityTone(event))} />
                        <p>
                          {getActivityDescription(event)}
                          <span>{formatTimestamp(event.timestamp)}</span>
                        </p>
                        <span className={chipClass(activityTone(event))}>{getActivityStatus(event)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  renderEmpty('No recent activity', 'Hub events will appear here after the next heartbeat or command.')
                )}
              </section>

              <section className="g-pane g-card hub-a-info">
                <header>
                  <h2>About this hub</h2>
                  <span className="g-label">{hubDevice?.device_id || 'hub'}</span>
                </header>
                {hubDevice ? (
                  <>
                    <dl className="g-info">
                      <div>
                        <dt>Device ID</dt>
                        <dd>{hubDevice.device_id || 'N/A'}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{hubDevice.online ? 'Online' : 'Offline'}</dd>
                      </div>
                      <div>
                        <dt>Type</dt>
                        <dd>{hubDevice.type || 'N/A'}</dd>
                      </div>
                      <div>
                        <dt>IP address</dt>
                        <dd>{hubDevice.online ? hubDevice.ip_address || 'N/A' : '-'}</dd>
                      </div>
                      <div>
                        <dt>Last seen</dt>
                        <dd>{formatDateTime(hubDevice.last_seen)}</dd>
                      </div>
                      <div>
                        <dt>Wi-Fi signal</dt>
                        <dd>{hubDevice.online ? (hubDevice.wifi_rssi ? `${hubDevice.wifi_rssi} dBm` : 'N/A') : '-'}</dd>
                      </div>
                      <div>
                        <dt>Uptime</dt>
                        <dd>{hubDevice.online ? formatUptime(hubDevice.uptime_ms) : '-'}</dd>
                      </div>
                      <div>
                        <dt>Free memory</dt>
                        <dd>{hubDevice.online ? (hubDevice.free_heap ? `${(hubDevice.free_heap / 1024).toFixed(1)} KB` : 'N/A') : '-'}</dd>
                      </div>
                    </dl>
                    <div className="g-row g-row--wrap" style={{ marginTop: 'var(--s-5)', gap: 'var(--s-2)' }}>
                      <button className="g-btn g-btn--ghost" type="button" onClick={() => setShowRestartModal(true)} disabled={restarting || !hubDevice.online}>
                        <Power size={16} />
                        Restart hub
                      </button>
                      <button className="g-btn g-btn--ghost" type="button" onClick={() => setShowAlertModal(true)} disabled={!hubDevice.online}>
                        <Send size={16} />
                        Send a message
                      </button>
                    </div>
                  </>
                ) : (
                  renderEmpty('No hub device found', 'Enroll or reconnect the hub to show its device information.')
                )}
              </section>
            </section>
          </>
        )}
      </main>

      {renderSensorModal(
        showTemperatureModal,
        'Temperature · last 24 hours',
        'Living room · DHT11 · comfort range 18-25 °C',
        metricText(sensorData?.temperature, '°C'),
        tempAvg == null ? metricText(sensorData?.temperature, '°C') : `${tempAvg.toFixed(1)}°C`,
        tempRange ? `${tempRange.min.toFixed(1)}-${tempRange.max.toFixed(1)}` : 'N/A',
        'temperature',
      )}
      {renderSensorModal(
        showHumidityModal,
        'Humidity · last 24 hours',
        'Living room · DHT11 · comfort range 30-60%',
        metricText(sensorData?.humidity, '%'),
        humAvg == null ? metricText(sensorData?.humidity, '%') : `${humAvg.toFixed(1)}%`,
        humRange ? `${humRange.min.toFixed(1)}-${humRange.max.toFixed(1)}` : 'N/A',
        'humidity',
      )}
      {renderSensorModal(
        showAirQualityModal,
        'Air quality · last 24 hours',
        `PM2.5 in µg/m³${sensorData?.aqi != null ? ` · AQI ${sensorData.aqi}` : ''}`,
        metricText(sensorData?.pm25, 'µg/m³'),
        airAvg == null ? metricText(sensorData?.pm25, 'µg/m³') : `${airAvg.toFixed(1)}µg/m³`,
        airRange ? `${airRange.min.toFixed(1)}-${airRange.max.toFixed(1)}` : 'N/A',
        'pm2_5',
        airTone === 'warn' || airTone === 'crit',
      )}

      {showRestartModal && (
        <div className="g-modal" role="dialog" aria-modal="true" onClick={() => setShowRestartModal(false)}>
          <div className="g-pane g-modal__card" style={modalNarrowStyle} onClick={(event) => event.stopPropagation()}>
            <div className="g-modal__head">
              <div>
                <h2>Restart the hub?</h2>
                <p>It will be offline briefly. Sensor readings and the activity list are kept.</p>
              </div>
            </div>
            <div className="g-modal__foot">
              <button className="g-btn g-btn--ghost" type="button" onClick={() => setShowRestartModal(false)}>
                Cancel
              </button>
              <button className="g-btn g-btn--danger" type="button" onClick={handleRestart} disabled={restarting || !hubDevice?.online}>
                {restarting ? <RefreshCw size={16} className="rotating" /> : <Power size={16} />}
                {restarting ? 'Restarting' : 'Restart'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAlertModal && (
        <div className="g-modal" role="dialog" aria-modal="true" onClick={() => setShowAlertModal(false)}>
          <form className="g-pane g-modal__card" style={modalNarrowStyle} onClick={(event) => event.stopPropagation()} onSubmit={handleSendAlert}>
            <div className="g-modal__head">
              <div>
                <h2>Send a message</h2>
                <p>Shows on the hub display for the duration you choose.</p>
              </div>
              <button className="g-icon-btn" type="button" onClick={() => setShowAlertModal(false)} aria-label="Close">
                <X size={15} strokeWidth={2} />
              </button>
            </div>
            <div className="g-stack">
              <div className="g-field">
                <label htmlFor="hub-message">Message</label>
                <input
                  id="hub-message"
                  type="text"
                  value={alertMessage}
                  onChange={(event) => setAlertMessage(event.target.value)}
                  placeholder="Dinner is ready"
                  maxLength={64}
                />
                <span className="g-field__hint">Up to 64 characters. The display fits two lines.</span>
              </div>
              <div className="g-grid g-grid--2">
                <div className="g-field">
                  <label htmlFor="hub-message-level">Importance</label>
                  <select
                    id="hub-message-level"
                    value={alertLevel}
                    onChange={(event) => setAlertLevel(event.target.value as typeof alertLevel)}
                  >
                    <option value="info">Normal</option>
                    <option value="warning">Warning</option>
                    <option value="error">Urgent</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="g-field">
                  <label htmlFor="hub-message-duration">Show for · {alertDuration}s</label>
                  <input
                    id="hub-message-duration"
                    className="g-slider"
                    type="range"
                    min={5}
                    max={60}
                    value={alertDuration}
                    onChange={(event) => setAlertDuration(Number(event.target.value))}
                    style={{ backgroundImage: sliderPaint(alertDuration - 5, 55) }}
                  />
                </div>
              </div>
            </div>
            <div className="g-modal__foot">
              <button className="g-btn g-btn--ghost" type="button" onClick={() => setShowAlertModal(false)}>
                Cancel
              </button>
              <button className="g-btn g-btn--primary" type="submit" disabled={sendingAlert || !alertMessage.trim()}>
                <Send size={16} />
                {sendingAlert ? 'Sending' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      )}
    </ProtectedRoute>
  );
}
