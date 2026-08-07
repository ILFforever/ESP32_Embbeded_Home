'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight, BellRing, Droplets, Home, Radio, Thermometer, Wind } from 'lucide-react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { SystemStatusCard } from '@/components/dashboard/SystemStatusCard';
import Link from 'next/link';
import GlassBar from '@/components/glass/GlassBar';
import { PageSkeleton } from '@/components/glass/Skeleton';
import { STATION_PRESETS } from '@/components/glass/StationPresetPicker';
import {
  findDoorbellDevice,
  findHubDevice,
  getAQICategory,
  getAllDevices,
  getDeviceStatusText,
  getHubAmpStreaming,
  getHubSensors,
  getLatestVisitors,
  type HubAmpState,
  type HubSensorResponse,
  type Visitor,
} from '@/services/devices.service';
import type { Device, DevicesStatus } from '@/types/dashboard';
import { relativeTime } from '@/utils/time';

function statusClass(device: Device | null) {
  return device?.online ? 'g-pill' : 'g-pill is-off';
}

function statusText(device: Device | null) {
  if (!device) return 'Not paired';
  return getDeviceStatusText(device.online, device.last_seen, device.type);
}

function visitorTimestamp(visitor: Visitor) {
  const stamp = visitor.detected_at || visitor.timestamp;
  if (stamp?._seconds) return stamp._seconds * 1000;
  if (stamp?.seconds) return stamp.seconds * 1000;
  return stamp;
}

export default function DevicesPage() {
  const [devicesStatus, setDevicesStatus] = useState<DevicesStatus | null>(null);
  const [hubSensors, setHubSensors] = useState<HubSensorResponse['sensors'] | null>(null);
  const [hubAmp, setHubAmp] = useState<HubAmpState | null>(null);
  const [latestVisitor, setLatestVisitor] = useState<Visitor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const nextDevices = await getAllDevices();
        const doorbell = findDoorbellDevice(nextDevices.devices);
        const hub = findHubDevice(nextDevices.devices);

        const [visitors, sensors, amplifier] = await Promise.all([
          doorbell ? getLatestVisitors(doorbell.device_id, 1) : Promise.resolve(null),
          hub ? getHubSensors(hub.device_id) : Promise.resolve(null),
          hub ? getHubAmpStreaming(hub.device_id) : Promise.resolve(null),
        ]);

        if (!active) return;
        setDevicesStatus(nextDevices);
        setLatestVisitor(visitors?.visitors[0] ?? null);
        setHubSensors(sensors?.sensors ?? null);
        setHubAmp(amplifier?.amplifier ?? null);
      } catch (error) {
        console.error('Error loading the core devices:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <ProtectedRoute>
        <PageSkeleton label="Loading the doorbell and hub." variant="device" />
      </ProtectedRoute>
    );
  }

  const doorbell = findDoorbellDevice(devicesStatus?.devices ?? []);
  const hub = findHubDevice(devicesStatus?.devices ?? []);
  const visitorName = latestVisitor
    ? latestVisitor.recognized ? latestVisitor.name || 'Recognised visitor' : 'Unknown visitor'
    : 'No recent visitor';
  const visitorWhen = latestVisitor ? relativeTime(visitorTimestamp(latestVisitor)) : 'Nothing recorded yet';
  const airQuality = hubSensors?.aqi != null ? getAQICategory(hubSensors.aqi).category : 'Waiting for a reading';
  const currentStation = STATION_PRESETS.find((station) => station.value === hubAmp?.current_url)?.label;
  const playback = hubAmp?.reported
    ? hubAmp.is_playing ? `${currentStation ?? 'Audio'} playing` : 'Nothing playing'
    : 'Waiting for playback status';

  return (
    <ProtectedRoute>
      <main className="g-page">
        <GlassBar />

        <div className="g-title">
          <h1>Devices</h1>
          <p>The doorbell and hub are the two places where the home listens, responds and keeps watch.</p>
        </div>

        <section className="device-spotlights" aria-label="Core devices">
          <Link className={`g-pane device-spotlight device-spotlight--doorbell ${doorbell?.online ? '' : 'is-warn'}`} href="/doorbell">
            <div className="device-spotlight__head">
              <div className="g-row">
                <BellRing size={22} aria-hidden="true" />
                <span className="g-label">Front door</span>
              </div>
              <span className={statusClass(doorbell)}><i /> {statusText(doorbell)}</span>
            </div>

            <div className="device-spotlight__intro">
              <h2>See who is there</h2>
              <p>Open the camera, speak through the doorbell and manage the people it recognises.</p>
            </div>

            <div className="device-spotlight__facts">
              <div>
                <span>Latest activity</span>
                <strong>{visitorName}</strong>
                <small>{visitorWhen}</small>
              </div>
              <div>
                <span>Connection</span>
                <strong>{doorbell?.online ? 'Ready for live view' : 'Camera unavailable'}</strong>
                <small>{doorbell?.last_seen ? `Last seen ${relativeTime(doorbell.last_seen)}` : 'No report received'}</small>
              </div>
            </div>

            <span className="g-btn g-btn--primary device-spotlight__action">
              Open doorbell <ArrowRight size={16} aria-hidden="true" />
            </span>
          </Link>

          <Link className={`g-pane device-spotlight device-spotlight--hub ${hub?.online ? '' : 'is-warn'}`} href="/hub">
            <div className="device-spotlight__head">
              <div className="g-row">
                <Home size={22} aria-hidden="true" />
                <span className="g-label">Living-room hub</span>
              </div>
              <span className={statusClass(hub)}><i /> {statusText(hub)}</span>
            </div>

            <div className="device-spotlight__intro">
              <h2>Read and control the room</h2>
              <p>Check the living-room environment, control the microphone and manage audio playback.</p>
            </div>

            <div className="device-spotlight__readings">
              <div><Thermometer size={16} aria-hidden="true" /><span>Temperature</span><strong>{hubSensors?.temperature != null ? `${hubSensors.temperature.toFixed(1)}°C` : '—'}</strong></div>
              <div><Droplets size={16} aria-hidden="true" /><span>Humidity</span><strong>{hubSensors?.humidity != null ? `${hubSensors.humidity.toFixed(0)}%` : '—'}</strong></div>
              <div><Wind size={16} aria-hidden="true" /><span>Air</span><strong>{airQuality}</strong></div>
            </div>

            <div className="device-spotlight__now">
              <Radio size={16} aria-hidden="true" />
              <span>{playback}</span>
            </div>

            <span className="g-btn g-btn--ghost device-spotlight__action">
              Open hub <ArrowRight size={16} aria-hidden="true" />
            </span>
          </Link>
        </section>

        <section className="g-pane g-card devices-inventory">
          <header>
            <div>
              <h2>All hardware</h2>
              <p className="g-sub">Sensors, locks and supporting boards enrolled with this home.</p>
            </div>
            <span className="g-label">{devicesStatus?.summary.online ?? 0} of {devicesStatus?.summary.total ?? 0} online</span>
          </header>
          <SystemStatusCard devicesStatus={devicesStatus} isExpanded />
        </section>
      </main>
    </ProtectedRoute>
  );
}
