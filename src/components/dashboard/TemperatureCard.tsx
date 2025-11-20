import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Thermometer } from 'lucide-react';
import type { TemperatureData } from '@/types/dashboard';

interface TemperatureCardProps {
  temperatureData: TemperatureData[];
  isExpanded?: boolean;
}

export function TemperatureCard({ temperatureData, isExpanded = false }: TemperatureCardProps) {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  // Prepare data for multi-room chart
  const prepareChartData = () => {
    if (!temperatureData.length) return [];

    // Get all timestamps from first room
    const timestamps = temperatureData[0].history.map(h => h.timestamp);

    return timestamps.map((timestamp, idx) => {
      const dataPoint: any = { timestamp: new Date(timestamp).toLocaleTimeString() };

      temperatureData.forEach(room => {
        dataPoint[room.room] = room.history[idx]?.value.toFixed(1);
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
      </div>

      <div className="card-content">
        {!isExpanded ? (
          /* Compact view - show current temps */
          <div className="temperature-compact">
            <div className="temp-grid">
              {temperatureData.map((data, idx) => (
                <div key={data.room} className="temp-item">
                  <span className="temp-room">{data.room}</span>
                  <span className="temp-value">{data.current.toFixed(1)}°C</span>
                  <span className="temp-humidity">{data.humidity?.toFixed(0) ?? 0}% RH</span>
                </div>
              ))}
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
                        dot={false}
                        activeDot={{ r: 6 }}
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
                            dot={false}
                            activeDot={{ r: 6 }}
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
