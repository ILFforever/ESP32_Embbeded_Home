import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Thermometer, RefreshCw } from 'lucide-react';
import type { TemperatureData } from '@/types/dashboard';
import { getHubSensors, getDeviceSensors, getAllDevices, findHubDevice, getSensorReadings } from '@/services/devices.service';

interface TemperatureCardProps {
  isExpanded?: boolean;
  refreshInterval?: number; // in milliseconds, default 5000
}

export function TemperatureCard({ isExpanded = false, refreshInterval = 5000 }: TemperatureCardProps) {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [temperatureData, setTemperatureData] = useState<TemperatureData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);

  const fetchTemperatureData = async () => {
    try {
      setRefetching(true);
      const devicesStatus = await getAllDevices();
      const devices = devicesStatus.devices;

      // Find hub device
      const hub = findHubDevice(devices);
      const allTemperatureData: TemperatureData[] = [];

      // Fetch Hub sensor data with historical readings
      if (hub && hub.online) {
        const hubSensors = await getHubSensors(hub.device_id);
        const hubReadings = await getSensorReadings(hub.device_id, 24);

        if (hubSensors && hubSensors.sensors) {
          const temperature = hubSensors.sensors.temperature || 0;
          const humidity = hubSensors.sensors.humidity || 0;

          // Convert historical readings to chart data
          const history = hubReadings?.readings.map(reading => ({
            timestamp: new Date(reading.timestamp._seconds * 1000).toISOString(),
            value: reading.temperature
          })) || [];

          allTemperatureData.push({
            room: 'Hub',
            current: temperature,
            humidity: humidity,
            history: history.length > 0 ? history : [{ timestamp: new Date().toISOString(), value: temperature }]
          });
        }
      }

      // Fetch sensor data for specific sensor devices (ss_001, ss_002, ss_003)
      const sensorIds = ['ss_001', 'ss_002', 'ss_003'];

      for (const sensorId of sensorIds) {
        const deviceSensors = await getDeviceSensors(sensorId);
        const sensorReadings = await getSensorReadings(sensorId, 24);

        if (deviceSensors && deviceSensors.sensors) {
          // Sensor is online and has data
          const temperature = deviceSensors.sensors.temperature || 0;
          const humidity = deviceSensors.sensors.humidity || 0;

          // Find device info from devices list if available
          const deviceInfo = devices.find(d => d.device_id === sensorId);
          const roomName = deviceInfo?.name || sensorId;

          // Convert historical readings to chart data
          const history = sensorReadings?.readings.map(reading => ({
            timestamp: new Date(reading.timestamp._seconds * 1000).toISOString(),
            value: reading.temperature
          })) || [];

          allTemperatureData.push({
            room: roomName,
            current: temperature,
            humidity: humidity,
            history: history.length > 0 ? history : [{ timestamp: new Date().toISOString(), value: temperature }]
          });
        } else {
          // Sensor is offline or returned null (404/400 error)
          const deviceInfo = devices.find(d => d.device_id === sensorId);
          const roomName = deviceInfo?.name || sensorId;

          // Create offline entry
          const offlineHistory = [{ timestamp: new Date().toISOString(), value: 0 }];

          allTemperatureData.push({
            room: `${roomName} (Offline)`,
            current: 0,
            humidity: 0,
            history: offlineHistory
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

  // Fetch temperature data from backend API - only on mount, no auto-refresh
  useEffect(() => {
    fetchTemperatureData();
  }, []);

  // Prepare data for multi-room chart
  const prepareChartData = () => {
    if (!temperatureData.length) return [];

    // Collect all unique timestamps from all rooms
    const allTimestamps = new Set<string>();
    temperatureData.forEach(room => {
      room.history.forEach(h => allTimestamps.add(h.timestamp));
    });

    // Sort timestamps chronologically
    const sortedTimestamps = Array.from(allTimestamps).sort();

    return sortedTimestamps.map((timestamp) => {
      const dataPoint: any = { timestamp: new Date(timestamp).toLocaleTimeString() };

      temperatureData.forEach(room => {
        // Find matching data point by timestamp
        const reading = room.history.find(h => h.timestamp === timestamp);
        if (reading && reading.value !== undefined) {
          dataPoint[room.room] = reading.value.toFixed(1);
        } else {
          dataPoint[room.room] = null; // No data for this timestamp
        }
      });

      return dataPoint;
    });
  };

  const chartData = prepareChartData();
  const colors = ['#FF6600', '#00FF88', '#0088FF', '#FF00FF'];

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          <Thermometer size={20} />
          <h3>TEMPERATURE</h3>
        </div>
        <button
          className="card-refresh-icon"
          onClick={(e) => { e.stopPropagation(); fetchTemperatureData(); }}
          disabled={refetching}
        >
          <RefreshCw size={20} className={refetching ? 'spinning' : ''} />
        </button>
      </div>

      <div className="card-content">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading temperature data...</div>
        ) : !isExpanded ? (
          /* Compact view - show current temps */
          <div className="temperature-compact">
            <div className="temp-grid">
              {temperatureData.length > 0 ? (
                temperatureData.map((data) => (
                  <div key={data.room} className="temp-item">
                    <span className="temp-room">{data.room}</span>
                    <span className="temp-value">{data.current.toFixed(1)}°C</span>
                    <span className="temp-humidity">{data.humidity?.toFixed(0) ?? 0}% RH</span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '20px', textAlign: 'center' }}>No temperature data available</div>
              )}
            </div>
          </div>
        ) : (
          /* Expanded view - Grafana-style charts */
          <div className="temperature-expanded">
            <div className="chart-controls">
              <div className="room-selector">
                <button
                  className={`room-button ${selectedRoom === null ? 'active' : ''}`}
                  onClick={() => setSelectedRoom(null)}
                >
                  ALL ROOMS
                </button>
                {temperatureData.map(data => (
                  <button
                    key={data.room}
                    className={`room-button ${selectedRoom === data.room ? 'active' : ''}`}
                    onClick={() => setSelectedRoom(data.room)}
                  >
                    {data.room}
                  </button>
                ))}
              </div>
            </div>

            {selectedRoom === null ? (
              /* Show all rooms on one chart */
              <div className="chart-container">
                <h4>TEMPERATURE HISTORY - ALL ROOMS (24H)</h4>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
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
                    <Legend
                      wrapperStyle={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                    />
                    {temperatureData.map((room, idx) => (
                      <Line
                        key={room.room}
                        type="monotone"
                        dataKey={room.room}
                        stroke={colors[idx % colors.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6 }}
                        connectNulls={true}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              /* Show single room with details */
              <div className="chart-container">
                {temperatureData
                  .filter(data => data.room === selectedRoom)
                  .map(data => (
                    <div key={data.room}>
                      <div className="room-details">
                        <div className="detail-item">
                          <span className="detail-label">CURRENT TEMPERATURE:</span>
                          <span className="detail-value">{data.current.toFixed(1)}°C</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">HUMIDITY:</span>
                          <span className="detail-value">{data.humidity?.toFixed(0) ?? 0}%</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">AVG (24H):</span>
                          <span className="detail-value">
                            {(data.history.reduce((sum, h) => sum + h.value, 0) / data.history.length).toFixed(1)}°C
                          </span>
                        </div>
                      </div>
                      <h4>TEMPERATURE HISTORY - {selectedRoom.toUpperCase()} (24H)</h4>
                      <ResponsiveContainer width="100%" height={400}>
                        <LineChart
                          data={data.history.map(h => ({
                            timestamp: new Date(h.timestamp).toLocaleTimeString(),
                            temperature: h.value.toFixed(1)
                          }))}
                          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                        >
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
                            dataKey="temperature"
                            stroke="#FF6600"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 6 }}
                            connectNulls={true}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
