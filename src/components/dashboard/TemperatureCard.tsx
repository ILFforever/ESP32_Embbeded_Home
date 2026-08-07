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
import Sparkline from '@/components/glass/Sparkline';
import { ContentSkeleton } from '@/components/glass/Skeleton';
import { labelForId } from '@/utils/deviceNames';
import { lastSeenLabel, relativeTime } from '@/utils/time';
import {
  findHubDevice,
  getAllDevices,
  getDeviceSensors,
  getHubSensors,
  getSensorReadings,
} from '@/services/devices.service';

interface TemperatureCardProps {
  isExpanded?: boolean;
  /* Set when the surrounding surface — the dashboard modal — already draws
     the pane and names the card. Without it the modal stacked two titles
     ("temperature" over "Climate") and two refresh controls: the icon on
     this header and the labelled one beside the room tabs. */
  hideHeader?: boolean;
  refreshInterval?: number;
}

const chartMargins = { top: 18, right: 20, left: 6, bottom: 18 };

function readingTimestampToIso(timestamp: TemperatureData['history'][number]['timestamp'] | any) {
  if (timestamp?._seconds) return new Date(timestamp._seconds * 1000).toISOString();
  const date = new Date(timestamp as string | number | Date);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function TemperatureCard({ isExpanded = false, hideHeader = false }: TemperatureCardProps) {
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
            online: hub.online,
            last_seen: hub.last_seen ?? null,
            history: history.length > 0 ? history : [{ timestamp: new Date().toISOString(), value: temperature }],
          });
        }
      }

      const sensorIds = ['ss_001', 'ss_002', 'ss_003'];

      for (const sensorId of sensorIds) {
        const sensorDevice = devices.find(d => d.device_id === sensorId);
        const deviceSensors = await getDeviceSensors(sensorId);
        const sensorReadings = await getSensorReadings(sensorId, 24);
        // "Sensor 2" was the id rewritten, not a room. See deviceNames.ts.
        const roomName = labelForId(sensorId, sensorDevice?.name);

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
            online: sensorDevice?.online ?? false,
            last_seen: sensorDevice?.last_seen ?? null,
            history: history.length > 0 ? history : [{ timestamp: new Date().toISOString(), value: temperature }],
          });
        } else {
          allTemperatureData.push({
            room: roomName,
            current: 0,
            humidity: 0,
            online: false,
            last_seen: sensorDevice?.last_seen ?? null,
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
    <div className={hideHeader ? 'g-stack' : 'g-pane g-card'}>
      {!hideHeader && (
        <header>
          <div className="g-row">
            <Thermometer size={20} aria-hidden="true" />
            <h3>Climate</h3>
          </div>
          <button
            className="g-icon-btn"
            onClick={(e) => { e.stopPropagation(); fetchTemperatureData(); }}
            disabled={refetching}
            aria-busy={refetching}
            aria-label="Refresh temperature data"
          >
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        </header>
      )}

      {loading ? (
        <ContentSkeleton label="Loading climate readings." rows={3} />
      ) : !isExpanded ? (
        temperatureData.length > 0 ? (() => {
          /* One hero reading with its trend, then the rest as a quiet row.
             Four equal tiles gave the eye nowhere to land, and none of them
             showed which way the temperature was going. */
          /* Prefer a sensor that is actually reporting. Showing a value
             persisted months ago as though it were current is worse than
             showing nothing — the reader has no way to tell. */
          const live = temperatureData.filter(d => d.online);
          const [primary, ...rest] = live.length ? [...live, ...temperatureData.filter(d => !d.online)] : temperatureData;
          const series = (primary.history ?? []).map(h => h.value).filter(Number.isFinite);
          const low = series.length ? Math.min(...series) : primary.current;
          const high = series.length ? Math.max(...series) : primary.current;

          return (
            <>
              {primary.online ? (
                <>
                  <div className="g-metric-lg g-num">
                    {primary.current.toFixed(1)}
                    <sup>&deg;C</sup>
                  </div>
                  <p className="g-sub">
                    {primary.room} · {primary.humidity?.toFixed(0) ?? 0}% humidity
                    {series.length > 1 && ` · low ${low.toFixed(1)}, high ${high.toFixed(1)} today`}
                  </p>
                </>
              ) : (
                <>
                  <div className="g-metric-lg g-num g-dim">&mdash;</div>
                  <p className="g-sub">
                    {primary.room} is not reporting · last seen {relativeTime(primary.last_seen)}
                  </p>
                </>
              )}

              {rest.length > 0 && (
                <div className="g-row g-row--wrap" style={{ gap: 'var(--s-4)', marginTop: 'var(--s-3)' }}>
                  {rest.map(data => (
                    <span key={data.room} style={{ fontSize: '12.5px' }}>
                      <span className="g-dim">{data.room}</span>{' '}
                      {data.online ? (
                        <span className="g-num">{data.current.toFixed(1)}&deg;C</span>
                      ) : (
                        <span className="g-dim" title={lastSeenLabel(data.last_seen)}>&mdash;</span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              <Sparkline
                values={series}
                label={`${primary.room} temperature over time, between ${low.toFixed(1)} and ${high.toFixed(1)} degrees`}
              />
            </>
          );
        })() : (
          <div className="g-empty">
            <strong>No climate data</strong>
            <p>No temperature sensors have reported yet.</p>
          </div>
        )
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
              aria-busy={refetching}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
          </div>

          {selectedRoom && currentRoom && (
            <div className="g-grid g-grid--3">
              <div className="g-tile">
                <p className="g-label">Now</p>
                <div className="g-metric-sm g-num">{currentRoom.current.toFixed(1)}<small>&deg;C</small></div>
              </div>
              <div className="g-tile">
                <p className="g-label">Humidity</p>
                <div className="g-metric-sm g-num">{currentRoom.humidity?.toFixed(0) ?? 0}<small>%</small></div>
              </div>
              <div className="g-tile">
                <p className="g-label">24h average</p>
                <div className="g-metric-sm g-num">{currentAverage.toFixed(1)}<small>&deg;C</small></div>
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
