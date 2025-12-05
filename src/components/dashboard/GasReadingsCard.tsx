import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Wind, RefreshCw } from 'lucide-react';
import type { GasReading } from '@/types/dashboard';

interface GasReadingsCardProps {
  gasReadings: GasReading[];
  isExpanded?: boolean;
  onRefresh?: () => void;
}

export function GasReadingsCard({ gasReadings, isExpanded = false, onRefresh }: GasReadingsCardProps) {
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const [refetching, setRefetching] = useState(false);

  const handleRefresh = async () => {
    if (onRefresh) {
      setRefetching(true);
      await onRefresh();
      setRefetching(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'safe':
        return '#00FF88';
      case 'warning':
        return '#FFAA00';
      case 'danger':
        return '#FF0000';
      default:
        return '#FFF';
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'safe':
        return 'gas-status-safe';
      case 'warning':
        return 'gas-status-warning';
      case 'danger':
        return 'gas-status-danger';
      default:
        return '';
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          <Wind size={20} />
          <h3>GAS SENSORS</h3>
        </div>
        <button
          className="card-refresh-icon"
          onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
          disabled={refetching}
        >
          <RefreshCw size={20} className={refetching ? 'spinning' : ''} />
        </button>
      </div>

      <div className="card-content">
        {!isExpanded ? (
          /* Compact view - show current readings */
          <div className="gas-compact">
            {gasReadings.map(reading => (
              <div key={reading.sensor_id} className={`gas-item ${getStatusClass(reading.status)}`}>
                <div className="gas-header">
                  <span className="gas-location">{reading.location}</span>
                  <span className={`gas-status status-${reading.status}`}>
                    {reading.status.toUpperCase()}
                  </span>
                </div>
                <div className="gas-value">{reading.ppm.toFixed(0)} PPM</div>
              </div>
            ))}
          </div>
        ) : (
          /* Expanded view - Grafana-style charts */
          <div className="gas-expanded">
            <div className="chart-controls">
              <div className="sensor-selector">
                <button
                  className={`sensor-button ${selectedSensor === null ? 'active' : ''}`}
                  onClick={() => setSelectedSensor(null)}
                >
                  ALL SENSORS
                </button>
                {gasReadings.map(reading => (
                  <button
                    key={reading.sensor_id}
                    className={`sensor-button ${selectedSensor === reading.sensor_id ? 'active' : ''}`}
                    onClick={() => setSelectedSensor(reading.sensor_id)}
                  >
                    {reading.location}
                  </button>
                ))}
              </div>
              <button
                className="card-refresh-icon"
                onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                disabled={refetching}
                style={{ marginLeft: 'auto' }}
              >
                <RefreshCw size={20} className={refetching ? 'spinning' : ''} />
              </button>
            </div>

            {selectedSensor === null ? (
              /* Show all sensors overview */
              <div className="chart-container">
                <h4>GAS SENSOR OVERVIEW</h4>
                <div className="sensors-grid">
                  {gasReadings.map(reading => (
                    <div key={reading.sensor_id} className={`sensor-card ${getStatusClass(reading.status)}`}>
                      <h5>{reading.location}</h5>
                      <div className="sensor-value-large" style={{ color: getStatusColor(reading.status) }}>
                        {reading.ppm.toFixed(0)} PPM
                      </div>
                      <div className="sensor-status">
                        STATUS: <span className={`status-${reading.status}`}>{reading.status.toUpperCase()}</span>
                      </div>
                      <div className="sensor-details">
                        <p>ID: {reading.sensor_id}</p>
                        <p>SAFE: &lt;100 PPM</p>
                        <p>WARNING: 100-150 PPM</p>
                        <p>DANGER: &gt;150 PPM</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Show single sensor with history */
              <div className="chart-container">
                {gasReadings
                  .filter(reading => reading.sensor_id === selectedSensor)
                  .map(reading => (
                    <div key={reading.sensor_id}>
                      <div className="sensor-details-header">
                        <div className="detail-item">
                          <span className="detail-label">LOCATION:</span>
                          <span className="detail-value">{reading.location}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">CURRENT PPM:</span>
                          <span className="detail-value" style={{ color: getStatusColor(reading.status) }}>
                            {reading.ppm.toFixed(0)} PPM
                          </span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">STATUS:</span>
                          <span className={`detail-value status-${reading.status}`}>
                            {reading.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">AVG (24H):</span>
                          <span className="detail-value">
                            {(reading.history.reduce((sum, h) => sum + h.value, 0) / reading.history.length).toFixed(0)} PPM
                          </span>
                        </div>
                      </div>
                      <h4>GAS LEVELS HISTORY - {reading.location.toUpperCase()} (24H)</h4>
                      <ResponsiveContainer width="100%" height={400}>
                        <LineChart
                          data={reading.history.map(h => ({
                            timestamp: new Date(h.timestamp).toLocaleTimeString(),
                            ppm: h.value.toFixed(0)
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
                            label={{ value: 'Gas Level (PPM)', angle: -90, position: 'insideLeft', fill: '#FFF' }}
                          />
                          {/* Reference lines for thresholds */}
                          <ReferenceLine y={100} stroke="#FFAA00" strokeDasharray="3 3" label={{ value: 'WARNING', fill: '#FFAA00', fontFamily: 'monospace' }} />
                          <ReferenceLine y={150} stroke="#FF0000" strokeDasharray="3 3" label={{ value: 'DANGER', fill: '#FF0000', fontFamily: 'monospace' }} />
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
                            dataKey="ppm"
                            stroke={getStatusColor(reading.status)}
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
