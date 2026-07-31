'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cpu, Droplet, Radio, Thermometer, Wind, Zap } from 'lucide-react';
import type { DevicesStatus, Device } from '@/types/dashboard';
import {
  getDeviceStatusClass as getStatusClass,
  getDeviceStatusText as getStatusText,
} from '@/services/devices.service';

interface SystemStatusCardProps {
  devicesStatus: DevicesStatus | null;
  isExpanded?: boolean;
}

type ViewMode = 'devices' | 'sensors';

const SENSOR_TYPES = new Set(['sensor', 'gas_sensor']);
const RING_CIRCUMFERENCE = 56.5;

function isSensor(device: Device) {
  return SENSOR_TYPES.has(device.type);
}

function isDoorLock(device: Device) {
  return device.device_id?.startsWith('dl_');
}

function deviceKind(device: Device) {
  return device.type?.replace(/_/g, ' ') || 'device';
}

function formatTimestamp(timestamp: any): string {
  if (!timestamp) return 'Never';

  try {
    const date = timestamp.seconds
      ? new Date(timestamp.seconds * 1000)
      : timestamp.toDate && typeof timestamp.toDate === 'function'
        ? timestamp.toDate()
        : new Date(timestamp);

    if (Number.isNaN(date.getTime())) return 'Never';
    return date.toLocaleString();
  } catch {
    return 'Never';
  }
}

function formatUptime(ms?: number) {
  if (!ms) return 'N/A';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

function statusChipClass(online: boolean, lastSeen?: string | null, type?: string) {
  const status = getStatusClass(online, lastSeen || null, type);
  if (status.includes('online') || online) return 'g-chip g-chip--ok';
  if (status.includes('warning')) return 'g-chip g-chip--warn';
  return 'g-chip';
}

function dotClass(device: Device) {
  if (!device.online) return 'g-dot g-dot--off';
  const battery = getBatteryPercent(device);
  if (battery !== undefined && battery <= 20) return 'g-dot g-dot--warn';
  return 'g-dot g-dot--ok';
}

function getBatteryPercent(device: Device): number | undefined {
  if (isSensor(device) && device.sensor_data) return device.sensor_data.battery_percent;
  return device.battery;
}

function batteryRingClass(battery: number | undefined, online: boolean) {
  if (!online || battery === undefined) return 'g-ring__fill is-idle';
  if (battery <= 10) return 'g-ring__fill is-crit';
  if (battery <= 25) return 'g-ring__fill is-warn';
  return 'g-ring__fill';
}

function BatteryRing({ battery, online, label }: { battery?: number; online: boolean; label: string }) {
  const pct = online && battery !== undefined ? Math.max(0, Math.min(100, battery)) : 0;
  const dash = ((pct / 100) * RING_CIRCUMFERENCE).toFixed(1);

  return (
    <svg className="g-ring" viewBox="0 0 24 24" role="img" aria-label={label}>
      <circle className="g-ring__track" cx="12" cy="12" r="9" />
      <circle
        className={batteryRingClass(battery, online)}
        cx="12"
        cy="12"
        r="9"
        strokeDasharray={`${dash} ${RING_CIRCUMFERENCE}`}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

function DeviceName({ device }: { device: Device }) {
  return (
    <div className="g-row">
      <i className={dotClass(device)} />
      <div>
        <strong style={{ display: 'block', fontWeight: 600 }}>{device.name || deviceKind(device)}</strong>
        <span className="g-dim g-mono" style={{ fontSize: '12px' }}>{device.device_id || 'N/A'}</span>
      </div>
    </div>
  );
}

export function SystemStatusCard({ devicesStatus, isExpanded = false }: SystemStatusCardProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('devices');
  const [selectedSensor, setSelectedSensor] = useState<Device | null>(null);

  const allDevices = devicesStatus?.devices || [];
  const doorbellDevice = allDevices.find((device) => device.type === 'doorbell');
  const hubDevice = allDevices.find((device) => device.type === 'hub' || device.type === 'main_lcd');

  const nonSensorDevices = allDevices.filter((device) => !isSensor(device) && !isDoorLock(device));
  const sensorDevices = allDevices.filter(isSensor);
  const nonSensorOnlineDevices = nonSensorDevices.filter((device) => device.online).length;
  const onlineSensors = sensorDevices.filter((device) => device.online).length;
  const devicesNeedingAttention = allDevices.filter((device) => !device.online || (getBatteryPercent(device) ?? 100) <= 20).length;

  useEffect(() => {
    if (!selectedSensor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedSensor(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedSensor]);

  const handleDeviceClick = (device: Device) => (event: React.MouseEvent) => {
    event.stopPropagation();
    if (device.type === 'doorbell') router.push('/doorbell');
    if (device.type === 'hub' || device.type === 'main_lcd') router.push('/hub');
  };

  const compactDevices = [doorbellDevice, hubDevice].filter(Boolean) as Device[];

  if (!isExpanded) {
    return (
      <>
        <header>
          <h2>Devices</h2>
          <span className="g-label">{nonSensorOnlineDevices} of {nonSensorDevices.length} online</span>
        </header>

        {compactDevices.length > 0 ? (
          <div className="g-list">
            {compactDevices.map((device) => {
              const battery = getBatteryPercent(device);
              return (
                <div className="g-list__row" key={device.device_id}>
                  <i className={dotClass(device)} />
                  <p>
                    {device.name || deviceKind(device)}
                    <span>{getStatusText(device.online, device.last_seen || null, device.type)} · {formatTimestamp(device.last_seen)}</span>
                  </p>
                  <button className="g-icon-btn" onClick={handleDeviceClick(device)} aria-label={`Open ${device.name || deviceKind(device)}`}>
                    {device.type === 'doorbell' ? <Radio size={15} /> : <Cpu size={15} />}
                  </button>
                  {battery !== undefined && (
                    <div className="g-row" style={{ gridColumn: '2 / 4', marginTop: 'var(--s-1)' }}>
                      <BatteryRing battery={battery} online={device.online} label={`${device.name || deviceKind(device)} battery ${battery} percent`} />
                      <span className="g-mono g-dim">{battery}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="g-empty">
            <strong>No devices reporting</strong>
            <p>Doorbell and hub status will appear when the backend returns devices.</p>
          </div>
        )}

        <div className="g-tile" style={{ marginTop: 'var(--s-4)' }}>
          <div className="g-row g-row--between">
            <div>
              <p className="g-label">System health</p>
              <p className="g-sub">Sensors {onlineSensors} of {sensorDevices.length} online</p>
            </div>
            <div className={`g-metric-sm g-num ${devicesNeedingAttention ? 'is-warn' : ''}`}>
              {devicesNeedingAttention}
              <small>attention</small>
            </div>
          </div>
        </div>
      </>
    );
  }

  const displayDevices = viewMode === 'devices' ? nonSensorDevices : sensorDevices;

  return (
    <div className="g-stack">
      <div className="g-row g-row--between g-row--wrap">
        <div className="g-seg" data-choice aria-label="System status view">
          <button aria-current={viewMode === 'devices' ? 'true' : undefined} onClick={() => setViewMode('devices')}>
            <Cpu size={15} /> Devices
          </button>
          <button aria-current={viewMode === 'sensors' ? 'true' : undefined} onClick={() => setViewMode('sensors')}>
            <Radio size={15} /> Sensors
          </button>
        </div>
        <span className={`g-pill ${devicesNeedingAttention ? 'is-warn' : 'is-ok'}`}><i /> {devicesNeedingAttention || 'No'} need attention</span>
      </div>

      <div className="dash-modal-grid">
        <div className="g-tile">
          <p className="g-label">Devices online</p>
          <div className="g-metric-sm g-num">{nonSensorOnlineDevices}<small>of {nonSensorDevices.length}</small></div>
        </div>
        <div className="g-tile">
          <p className="g-label">Sensors online</p>
          <div className="g-metric-sm g-num">{onlineSensors}<small>of {sensorDevices.length}</small></div>
        </div>
        <div className={`g-tile ${devicesNeedingAttention ? 'is-warn' : ''}`}>
          <p className="g-label">Last sync</p>
          <div className="g-metric-sm">{devicesStatus ? new Date().toLocaleTimeString() : 'N/A'}</div>
        </div>
      </div>

      {displayDevices.length > 0 ? (
        <div className="g-scroll">
          <table className="g-table" aria-label={viewMode === 'devices' ? 'System devices' : 'System sensors'}>
            <thead>
              <tr>
                <th>{viewMode === 'devices' ? 'Device' : 'Sensor'}</th>
                <th>Type</th>
                <th>Status</th>
                <th>Battery</th>
                <th>Last seen</th>
                <th className="g-num-cell">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayDevices.map((device) => {
                const battery = getBatteryPercent(device);
                const canOpen = device.type === 'doorbell' || device.type === 'hub' || device.type === 'main_lcd';
                return (
                  <tr key={device.device_id}>
                    <td><DeviceName device={device} /></td>
                    <td style={{ textTransform: 'capitalize' }}>{deviceKind(device)}</td>
                    <td>
                      <span className={statusChipClass(device.online, device.last_seen, device.type)}>
                        {getStatusText(device.online, device.last_seen || null, device.type)}
                      </span>
                    </td>
                    <td>
                      <div className="g-row">
                        <BatteryRing
                          battery={battery}
                          online={device.online}
                          label={`${device.name || deviceKind(device)} battery ${battery ?? 0} percent`}
                        />
                        <span className={battery === undefined ? 'g-dim' : 'g-num'}>{battery === undefined ? 'Unknown' : `${battery}%`}</span>
                      </div>
                    </td>
                    <td>{formatTimestamp(device.last_seen)}</td>
                    <td className="g-num-cell">
                      {viewMode === 'sensors' ? (
                        <button className="g-btn g-btn--ghost" onClick={() => setSelectedSensor(device)}>Details</button>
                      ) : canOpen ? (
                        <button className="g-btn g-btn--ghost" onClick={handleDeviceClick(device)}>Open</button>
                      ) : (
                        <span className="g-dim">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="g-empty">
          <strong>No {viewMode === 'devices' ? 'devices' : 'sensors'} found</strong>
          <p>They will appear here after the backend reports enrolled hardware.</p>
        </div>
      )}

      {selectedSensor && (
        <div className="g-modal" role="dialog" aria-modal="true" aria-labelledby="sensor-details-title" onClick={() => setSelectedSensor(null)}>
          <div className="g-pane g-modal__card" onClick={(event) => event.stopPropagation()}>
            <div className="g-modal__head">
              <div>
                <h2 id="sensor-details-title">{selectedSensor.name || 'Sensor details'}</h2>
                <p>{selectedSensor.device_id || 'N/A'} · {selectedSensor.online ? 'online' : 'offline'}</p>
              </div>
              <button className="g-icon-btn" onClick={() => setSelectedSensor(null)} aria-label="Close">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <dl className="g-info">
              <div><dt>Connection</dt><dd>{selectedSensor.online ? 'Online' : 'Offline'}</dd></div>
              <div><dt>Device type</dt><dd>{selectedSensor.sensor_data?.device_type || selectedSensor.type || '-'}</dd></div>
              <div><dt>Last updated</dt><dd>{formatTimestamp(selectedSensor.last_seen)}</dd></div>
              <div><dt>Battery</dt><dd>{selectedSensor.online && getBatteryPercent(selectedSensor) !== undefined ? `${getBatteryPercent(selectedSensor)}%` : '-'}</dd></div>
              <div><dt>Voltage</dt><dd>{selectedSensor.online && selectedSensor.sensor_data?.battery_voltage ? `${selectedSensor.sensor_data.battery_voltage.toFixed(2)}V` : '-'}</dd></div>
              <div><dt>Boot count</dt><dd>{selectedSensor.online ? selectedSensor.sensor_data?.boot_count ?? '-' : '-'}</dd></div>
              <div><dt>Forwarded by</dt><dd>{selectedSensor.online ? selectedSensor.sensor_data?.forwarded_by || '-' : '-'}</dd></div>
              <div><dt>Alert state</dt><dd>{selectedSensor.online ? selectedSensor.sensor_data?.alert ? 'Active' : 'Normal' : '-'}</dd></div>
              <div><dt>Sample count</dt><dd>{selectedSensor.online ? selectedSensor.sensor_data?.sample_count ?? '-' : '-'}</dd></div>
            </dl>

            <div className="g-grid g-grid--2" style={{ marginTop: 'var(--s-5)' }}>
              {selectedSensor.sensor_data?.temperature !== undefined && (
                <div className="g-tile"><p className="g-label"><Thermometer size={14} /> Temperature</p><div className="g-metric-sm g-num">{selectedSensor.online ? selectedSensor.sensor_data.temperature.toFixed(1) : '-'}<small>deg C</small></div></div>
              )}
              {selectedSensor.sensor_data?.humidity !== undefined && (
                <div className="g-tile"><p className="g-label"><Droplet size={14} /> Humidity</p><div className="g-metric-sm g-num">{selectedSensor.online ? selectedSensor.sensor_data.humidity.toFixed(1) : '-'}<small>%</small></div></div>
              )}
              {selectedSensor.sensor_data?.gas_level !== undefined && (
                <div className="g-tile"><p className="g-label"><Wind size={14} /> Gas</p><div className="g-metric-sm g-num">{selectedSensor.online ? selectedSensor.sensor_data.gas_level : '-'}<small>ppm</small></div></div>
              )}
              {selectedSensor.sensor_data?.light_lux !== undefined && (
                <div className="g-tile"><p className="g-label"><Zap size={14} /> Light</p><div className="g-metric-sm g-num">{selectedSensor.online ? selectedSensor.sensor_data.light_lux.toFixed(0) : '-'}<small>lux</small></div></div>
              )}
            </div>

            <div className="g-modal__foot">
              <button className="g-btn g-btn--primary" onClick={() => setSelectedSensor(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
