import React, { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCw, Wind } from 'lucide-react';
import type { GasReading } from '@/types/dashboard';
import { lastSeenLabel, relativeTime } from '@/utils/time';

interface GasReadingsCardProps {
  gasReadings: GasReading[];
  isExpanded?: boolean;
  /* See TemperatureCard: the modal draws the pane and the title, so the
     header here would repeat both — and its refresh icon would sit a few
     pixels from the labelled Refresh beside the sensor tabs. */
  hideHeader?: boolean;
  onRefresh?: () => void;
}

const chartMargins = { top: 18, right: 22, left: 6, bottom: 18 };

export function GasReadingsCard({ gasReadings, isExpanded = false, hideHeader = false, onRefresh }: GasReadingsCardProps) {
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const [refetching, setRefetching] = useState(false);

  const handleRefresh = async () => {
    if (onRefresh) {
      setRefetching(true);
      await onRefresh();
      setRefetching(false);
    }
  };

  const getStatusTokenClass = (status: GasReading['status']) => {
    switch (status) {
      case 'safe':
        return 'is-ok';
      case 'warning':
        return 'is-warn';
      case 'danger':
        return 'is-crit';
      default:
        return '';
    }
  };

  const getChipClass = (status: GasReading['status']) => {
    switch (status) {
      case 'safe':
        return 'g-chip g-chip--ok';
      case 'warning':
        return 'g-chip g-chip--warn';
      case 'danger':
        return 'g-chip g-chip--crit';
      default:
        return 'g-chip';
    }
  };

  const getMeterClass = (status: GasReading['status']) => {
    if (status === 'danger') return 'is-crit';
    if (status === 'warning') return 'is-warn';
    return '';
  };

  const selectedReading = selectedSensor
    ? gasReadings.find(reading => reading.sensor_id === selectedSensor)
    : null;

  const readingAverage = selectedReading
    ? selectedReading.history.reduce((sum, h) => sum + h.value, 0) / Math.max(selectedReading.history.length, 1)
    : 0;

  return (
    <div className={hideHeader ? 'g-stack' : 'g-pane g-card'}>
      {!hideHeader && (
        <header>
          <div className="g-row">
            <Wind size={20} aria-hidden="true" />
            <h3>Air quality</h3>
          </div>
          <button
            className="g-icon-btn"
            onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
            disabled={refetching}
            aria-label="Refresh gas readings"
          >
            <RefreshCw size={17} className={refetching ? 'spinning' : ''} aria-hidden="true" />
          </button>
        </header>
      )}

      {!isExpanded ? (
        <div className="g-stack">
          {gasReadings.length > 0 ? (
            gasReadings.map(reading => {
              /* An offline sensor gets no number at all. Its last persisted
                 value is often 0, and a greyed "0 ppm" still reads as zero
                 at a glance — which is the opposite of the truth, that we
                 have not heard from it. On a gas sensor that matters. */
              const stale = reading.online === false;
              const pct = stale ? 0 : Math.max(0, Math.min(100, Math.round((reading.ppm / 500) * 100)));
              return (
                <div key={reading.sensor_id}>
                  <div className="g-meter-row">
                    <span className={stale ? 'g-dim' : undefined}>{reading.location}</span>
                    {stale ? (
                      <b className="g-dim" style={{ fontWeight: 400, fontSize: '12.5px' }}>
                        No reading · last seen {relativeTime(reading.last_seen)}
                      </b>
                    ) : (
                      <b className={getStatusTokenClass(reading.status)}>{reading.ppm.toFixed(0)} ppm</b>
                    )}
                  </div>
                  <div className="g-meter">
                    {!stale && (
                      <>
                        <i className={getMeterClass(reading.status)} style={{ width: `${pct}%` }} />
                        <span className="g-meter__limit" style={{ left: '30%' }} />
                      </>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="g-empty">
              <strong>No air readings</strong>
              <p>No gas sensors have reported yet.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="g-stack">
          <div className="g-row g-row--between g-row--wrap">
            <div className="g-seg" data-choice aria-label="Gas sensors">
              <button
                type="button"
                aria-current={selectedSensor === null ? 'true' : undefined}
                onClick={() => setSelectedSensor(null)}
              >
                Overview
              </button>
              {gasReadings.map(reading => (
                <button
                  type="button"
                  key={reading.sensor_id}
                  aria-current={selectedSensor === reading.sensor_id ? 'true' : undefined}
                  onClick={() => setSelectedSensor(reading.sensor_id)}
                >
                  {reading.location}
                </button>
              ))}
            </div>
            <button
              className="g-btn g-btn--ghost"
              onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
              disabled={refetching}
            >
              <RefreshCw size={16} className={refetching ? 'spinning' : ''} aria-hidden="true" />
              Refresh
            </button>
          </div>

          {selectedReading ? (
            <>
              <div className="g-grid g-grid--3">
                <div className={`g-tile ${getStatusTokenClass(selectedReading.status)}`}>
                  <p className="g-label">Now</p>
                  <div className="g-metric-sm g-num">{selectedReading.ppm.toFixed(0)}<small>ppm</small></div>
                </div>
                <div className="g-tile">
                  <p className="g-label">24h average</p>
                  <div className="g-metric-sm g-num">{readingAverage.toFixed(0)}<small>ppm</small></div>
                </div>
                <div className="g-tile">
                  <p className="g-label">Status</p>
                  <span className={getChipClass(selectedReading.status)}>{selectedReading.status}</span>
                </div>
              </div>
              <div className={selectedReading.status === 'safe' ? 'g-chart' : 'g-chart g-chart--warn'} role="img" aria-label={`${selectedReading.location} gas history over 24 hours`}>
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart
                    data={selectedReading.history.map(h => ({
                      timestamp: new Date(h.timestamp).toLocaleTimeString(),
                      ppm: Number(h.value.toFixed(0)),
                    }))}
                    margin={chartMargins}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
                    <XAxis dataKey="timestamp" tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 11 }} stroke="var(--hairline)" interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 11 }} stroke="var(--hairline)" width={36} />
                    <ReferenceLine y={100} stroke="var(--warn)" strokeDasharray="5 4" label={{ value: 'warn 100', fill: 'var(--ink-3)', fontSize: 11 }} />
                    <ReferenceLine y={150} stroke="var(--crit)" strokeDasharray="5 4" label={{ value: 'danger 150', fill: 'var(--ink-3)', fontSize: 11 }} />
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
                    <Line type="monotone" dataKey="ppm" stroke="currentColor" strokeWidth={2.2} dot={false} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="g-grid g-grid--3">
              {gasReadings.map(reading => (
                <div key={reading.sensor_id} className={`g-tile ${getStatusTokenClass(reading.status)}`}>
                  <div className="g-row g-row--between">
                    <p className="g-label">{reading.location}</p>
                    <span className={getChipClass(reading.status)}>{reading.status}</span>
                  </div>
                  <div className="g-metric-sm g-num">{reading.ppm.toFixed(0)}<small>ppm</small></div>
                  <p className="g-sub">
                    ID {reading.sensor_id}
                    {reading.gas_level !== undefined ? ` · raw ${reading.gas_level.toFixed(0)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
