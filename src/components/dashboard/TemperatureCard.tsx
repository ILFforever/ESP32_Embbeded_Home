import React, { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCw, Thermometer } from 'lucide-react';
import type { TemperatureData } from '@/types/dashboard';
import {
  findHubDevice,
  getAllDevices,
  getDeviceSensors,
  getHubSensors,
  getSensorReadings,
} from '@/services/devices.service';

interface TemperatureCardProps {
  isExpanded?: boolean;
  refreshInterval?: number;
}

const chartMargins = { top: 18, right: 20, left: 6, bottom: 18 };

function readingTimestampToIso(timestamp: TemperatureData['history'][number]['timestamp'] | any) {
  if (timestamp?._seconds) return new Date(timestamp._seconds * 1000).toISOString();
  const date = new Date(timestamp as string | number | Date);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function TemperatureCard({ isExpanded = false }: TemperatureCardProps) {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [temperatureData, setTemperatureData] = useState<TemperatureData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);

  const fetchTemperatureData = async () => {
    try {
      setRefetching(true);
      const devicesStatus = await getAllDevices();
      const devices = devicesStatus.devices;
      const hub = findHubDevice(devices);
      const allTemperatureData: TemperatureData[] = [];

      if (hub && hub.online) {
        const hubSensors = await getHubSensors(hub.device_id);
        const hubReadings = await getSensorReadings(hub.device_id, 24);

        if (hubSensors && hubSensors.sensors) {
          const temperature = hubSensors.sensors.temperature || 0;
          const humidity = hubSensors.sensors.humidity || 0;
          const history = hubReadings?.readings.map(reading => ({
            timestamp: readingTimestampToIso(reading.timestamp),
            value: reading.temperature,
          })) || [];

          allTemperatureData.push({
            room: 'Hub',
            current: temperature,
            humidity,
            history: history.length > 0 ? history : [{ timestamp: new Date().toISOString(), value: temperature }],
          });
        }
      }

      const sensorIds = ['ss_001', 'ss_002', 'ss_003'];

      for (const sensorId of sensorIds) {
        const deviceSensors = await getDeviceSensors(sensorId);
        const sensorReadings = await getSensorReadings(sensorId, 24);
        const match = sensorId.match(/ss_(\d+)/);
        const sensorNumber = match ? parseInt(match[1], 10) : sensorId;
        const roomName = match ? `Sensor ${sensorNumber}` : sensorId;

        if (deviceSensors && deviceSensors.sensors) {
          const temperature = deviceSensors.sensors.temperature || 0;
          const humidity = deviceSensors.sensors.humidity || 0;
          const history = sensorReadings?.readings.map(reading => ({
            timestamp: readingTimestampToIso(reading.timestamp),
            value: reading.temperature,
          })) || [];

          allTemperatureData.push({
            room: roomName,
            current: temperature,
            humidity,
            history: history.length > 0 ? history : [{ timestamp: new Date().toISOString(), value: temperature }],
          });
        } else {
          allTemperatureData.push({
            room: `${roomName} (Offline)`,
            current: 0,
            humidity: 0,
            history: [{ timestamp: new Date().toISOString(), value: 0 }],
          });
        }
      }

      setTemperatureData(allTemperatureData);
    } catch (error) {
      console.error('Error fetching temperature data:', error);
    } finally {
      setLoading(false);
      setRefetching(false);
    }
  };

  useEffect(() => {
    fetchTemperatureData();
  }, []);

  const prepareChartData = () => {
    if (!temperatureData.length) return [];

    const allTimestamps = new Set<string>();
    temperatureData.forEach(room => {
      room.history.forEach(h => allTimestamps.add(h.timestamp));
    });

    return Array.from(allTimestamps).sort().map(timestamp => {
      const dataPoint: Record<string, string | number | null> = {
        timestamp: new Date(timestamp).toLocaleTimeString(),
      };

      temperatureData.forEach(room => {
        const reading = room.history.find(h => h.timestamp === timestamp);
        dataPoint[room.room] = reading && reading.value !== undefined ? Number(reading.value.toFixed(1)) : null;
      });

      return dataPoint;
    });
  };

  const chartData = prepareChartData();
  const visibleRooms = selectedRoom ? temperatureData.filter(data => data.room === selectedRoom) : temperatureData;
  const currentRoom = visibleRooms[0];
  const currentAverage = currentRoom
    ? currentRoom.history.reduce((sum, h) => sum + (h.value ?? 0), 0) / Math.max(currentRoom.history.length, 1)
    : 0;

  return (
    <div className="g-pane g-card">
      <header>
        <div className="g-row">
          <Thermometer size={20} aria-hidden="true" />
          <h3>Climate</h3>
        </div>
        <button
          className="g-icon-btn"
          onClick={(e) => { e.stopPropagation(); fetchTemperatureData(); }}
          disabled={refetching}
          aria-label="Refresh temperature data"
        >
          <RefreshCw size={17} className={refetching ? 'spinning' : ''} aria-hidden="true" />
        </button>
      </header>

      {loading ? (
        <div className="g-empty">
          <strong>Loading climate readings</strong>
          <p>Waiting for the sensors to report back.</p>
        </div>
      ) : !isExpanded ? (
        <div className="g-grid g-grid--2">
          {temperatureData.length > 0 ? (
            temperatureData.map(data => (
              <div key={data.room} className={`g-tile${data.current === 0 ? ' is-warn' : ''}`}>
                <p className="g-label">{data.room}</p>
                <div className="g-metric-sm g-num">
                  {data.current.toFixed(1)}
                  <small>deg C</small>
                </div>
                <p className="g-sub">{data.humidity?.toFixed(0) ?? 0}% humidity</p>
              </div>
            ))
          ) : (
            <div className="g-empty">
              <strong>No climate data</strong>
              <p>No temperature sensors have reported yet.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="g-stack">
          <div className="g-row g-row--between g-row--wrap">
            <div className="g-seg" data-choice aria-label="Climate rooms">
              <button
                type="button"
                aria-current={selectedRoom === null ? 'true' : undefined}
                onClick={() => setSelectedRoom(null)}
              >
                All rooms
              </button>
              {temperatureData.map(data => (
                <button
                  type="button"
                  key={data.room}
                  aria-current={selectedRoom === data.room ? 'true' : undefined}
                  onClick={() => setSelectedRoom(data.room)}
                >
                  {data.room}
                </button>
              ))}
            </div>
            <button
              className="g-btn g-btn--ghost"
              onClick={(e) => { e.stopPropagation(); fetchTemperatureData(); }}
              disabled={refetching}
            >
              <RefreshCw size={16} className={refetching ? 'spinning' : ''} aria-hidden="true" />
              Refresh
            </button>
          </div>

          {selectedRoom && currentRoom && (
            <div className="g-grid g-grid--3">
              <div className="g-tile">
                <p className="g-label">Now</p>
                <div className="g-metric-sm g-num">{currentRoom.current.toFixed(1)}<small>deg C</small></div>
              </div>
              <div className="g-tile">
                <p className="g-label">Humidity</p>
                <div className="g-metric-sm g-num">{currentRoom.humidity?.toFixed(0) ?? 0}<small>%</small></div>
              </div>
              <div className="g-tile">
                <p className="g-label">24h average</p>
                <div className="g-metric-sm g-num">{currentAverage.toFixed(1)}<small>deg C</small></div>
              </div>
            </div>
          )}

          <div className="g-chart" role="img" aria-label={selectedRoom ? `${selectedRoom} temperature history over 24 hours` : 'All room temperature histories over 24 hours'}>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart
                data={selectedRoom && currentRoom
                  ? currentRoom.history.map(h => ({
                      timestamp: new Date(h.timestamp).toLocaleTimeString(),
                      temperature: h.value != null ? Number(h.value.toFixed(1)) : 0,
                    }))
                  : chartData}
                margin={chartMargins}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
                <XAxis dataKey="timestamp" tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 11 }} stroke="var(--hairline)" interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 11 }} stroke="var(--hairline)" width={36} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--modal-bg)',
                    border: '1px solid var(--outline)',
                    borderRadius: 'var(--r-field)',
                    color: 'var(--ink)',
                    fontFamily: 'var(--font)',
                  }}
                  labelStyle={{ color: 'var(--ink-2)' }}
                />
                {!selectedRoom && <Legend wrapperStyle={{ color: 'var(--ink-2)', fontFamily: 'var(--font)' }} />}
                {selectedRoom && currentRoom ? (
                  <Line type="monotone" dataKey="temperature" stroke="currentColor" strokeWidth={2.2} dot={false} activeDot={{ r: 5 }} connectNulls />
                ) : (
                  temperatureData.map(room => (
                    <Line key={room.room} type="monotone" dataKey={room.room} stroke="currentColor" strokeWidth={2.2} dot={false} activeDot={{ r: 5 }} connectNulls />
                  ))
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
