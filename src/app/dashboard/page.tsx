'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import GlassBar from '@/components/glass/GlassBar';
import { AlertsCard } from '@/components/dashboard/AlertsCard';
import { TemperatureCard } from '@/components/dashboard/TemperatureCard';
import { GasReadingsCard } from '@/components/dashboard/GasReadingsCard';
import { DoorCard } from '@/components/dashboard/DoorCard';
import { AdminManagementCard } from '@/components/dashboard/AdminManagementCard';
import { NfcManagementCard } from '@/components/dashboard/NfcManagementCard';
import { SystemStatusCard } from '@/components/dashboard/SystemStatusCard';
import { MusicBroadcastCard } from '@/components/dashboard/MusicBroadcastCard';
import {
  getAllDevices,
  getAlerts,
  getGasReadingsForDashboard,
  getLockStatus
} from '@/services/devices.service';
import type { DevicesStatus, GasReading, Alert } from '@/types/dashboard';
import { getAlertTitle } from '@/utils/alertText';
import { greeting, relativeTime } from '@/utils/time';

export default function DashboardPage() {
  const { user } = useAuth();
  const [devicesStatus, setDevicesStatus] = useState<DevicesStatus | null>(null);
  const [gasReadings, setGasReadings] = useState<GasReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [systemOnline, setSystemOnline] = useState<boolean>(false);
  const [allDevicesOnline, setAllDevicesOnline] = useState<boolean>(false);
  const [doorLockStates, setDoorLockStates] = useState<Record<string, 'locked' | 'unlocked'>>({});


  const fetchAlerts = async () => {
    try {
      // Fetch all alerts with a limit of 50
      const alertsData = await getAlerts();
      setAlerts(alertsData);
    } catch (error) {
      console.error('Error loading alerts:', error);
    }
  };

  const fetchGasReadings = async () => {
    try {
      const gasData = await getGasReadingsForDashboard();
      setGasReadings(gasData);
    } catch (error) {
      console.error('Error loading gas readings:', error);
    }
  };

  useEffect(() => {
    /* First paint used to wait on every request in series — devices, then
       gas (which itself walks the sensors one at a time), then alerts,
       then a lock per iteration, then /info. About ten round trips to
       Fly.io before anything appeared: measured 5.5s to content on a
       phone.

       Now the shell renders as soon as the device list lands, and the
       rest fills in concurrently. Each branch owns its own failure so a
       single slow endpoint cannot hold up the others. */
    const fetchData = async () => {
      let devices;
      try {
        devices = await getAllDevices();
        setDevicesStatus(devices);
        setAllDevicesOnline(devices.summary.offline === 0 && devices.summary.total > 0);
      } catch (error) {
        console.error('Error loading devices:', error);
        setSystemOnline(false);
        setAllDevicesOnline(false);
      } finally {
        // Paint now. Everything below refines what is already on screen.
        setLoading(false);
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const doorLocks = devices?.devices.filter(d => d.device_id.startsWith('dl_')) ?? [];

      await Promise.allSettled([
        getGasReadingsForDashboard()
          .then(setGasReadings)
          .catch(e => console.error('Error loading gas readings:', e)),

        fetchAlerts(),

        Promise.all(
          doorLocks.map(lock =>
            getLockStatus(lock.device_id)
              .then(status => [lock.device_id, status?.lock_state] as const)
              .catch(() => [lock.device_id, undefined] as const),
          ),
        ).then(entries => {
          const lockStates: Record<string, 'locked' | 'unlocked'> = {};
          entries.forEach(([id, state]) => { if (state) lockStates[id] = state; });
          setDoorLockStates(lockStates);
        }),

        fetch(`${apiUrl}/info`)
          .then(r => (r.ok ? r.text() : ''))
          .then(text => setSystemOnline(text.includes('Arduino-888-SmartHome is running!')))
          .catch(() => setSystemOnline(false)),
      ]);
    };

    fetchData();
    // Refresh every 5 seconds for more real-time updates
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  /* ?card=alerts opens that card's expanded view on load, so a card can be
     linked to directly. Access and Admin used to arrive this way because
     they had no route of their own; they now live at /access and /admin,
     but the deep link still works for every card on this page. */
  useEffect(() => {
    const card = new URLSearchParams(window.location.search).get('card');
    if (card) setExpandedCard(card);
  }, []);

  useEffect(() => {
    if (!expandedCard) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeExpandedCard();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expandedCard]);

  const openExpandedCard = (cardId: string) => {
    setExpandedCard(cardId);
  };

  const closeExpandedCard = () => {
    setExpandedCard(null);
  };

  const handleCardKey = (event: React.KeyboardEvent<HTMLElement>, cardId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openExpandedCard(cardId);
    }
  };

  // Get real door lock devices from backend (filter for dl_* devices)
  const doorsWindows = devicesStatus?.devices
    .filter(device => device.device_id.startsWith('dl_'))
    .map(device => ({
      id: device.device_id,
      name: device.name || device.device_id,
      location: 'Door',
      type: 'door' as const,
      status: doorLockStates[device.device_id] || 'locked',
      last_changed: device.last_seen || new Date().toISOString(),
      battery: device.battery,
      online: device.online
    })) || [];

  if (loading) {
    return (
      <div className="g-waiting">
        <div className="g-waiting__inner">
          <div className="g-spinner" aria-hidden="true" />
          <h1>{greeting()}</h1>
          <p aria-live="polite">Fetching devices, sensors and alerts.</p>
        </div>
      </div>
    );
  }

  // Render expanded card content with more details
  const renderExpandedCard = () => {
    if (!expandedCard) return null;

    let content;
    switch (expandedCard) {
      case 'system-status':
        content = <SystemStatusCard devicesStatus={devicesStatus} isExpanded={true} />;
        break;
      case 'alerts':
        content = <AlertsCard alerts={alerts} isExpanded={true} onRefresh={fetchAlerts} />;
        break;
      case 'temperature':
        content = <TemperatureCard isExpanded={true} />;
        break;
      case 'gas':
        content = <GasReadingsCard gasReadings={gasReadings} isExpanded={true} onRefresh={fetchGasReadings} />;
        break;
      case 'doors':
        content = <DoorCard doorsWindows={doorsWindows} isExpanded={true} />;
        break;
      case 'admin':
        // Only admins can view admin management
        if (user?.role === 'admin') {
          content = <AdminManagementCard devices={devicesStatus?.devices || []} isExpanded={true} />;
        } else {
          content = null;
        }
        break;
      case 'nfc':
        content = <NfcManagementCard isExpanded={true} />;
        break;
      case 'music':
        content = <MusicBroadcastCard isExpanded={true} />;
        break;

      default:
        content = null;
    }

    return (
      <div className="g-modal" role="dialog" aria-modal="true" onClick={closeExpandedCard}>
        <div className="g-pane g-modal__card g-modal__card--wide" onClick={(e) => e.stopPropagation()}>
          <div className="g-modal__head">
            <div>
              <h2>{expandedCard.replace(/-/g, ' ')}</h2>
              <p>Live details from Arduino888.</p>
            </div>
            <button className="g-icon-btn" onClick={closeExpandedCard} aria-label="Close">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {content}
        </div>
      </div>
    );
  };

  const offlineTotal = devicesStatus?.summary.offline || 0;

  return (
    <ProtectedRoute>
      <main className="g-page">
        <GlassBar
          current="home"
          pillTone={systemOnline && allDevicesOnline ? 'ok' : 'warn'}
          pill={
            systemOnline && allDevicesOnline
              ? 'All systems normal'
              : `${offlineTotal} ${offlineTotal === 1 ? 'needs' : 'need'} attention`
          }
        />

        <div className="g-title">
          <h1>{greeting()}</h1>
          <p>
            {!systemOnline
              ? 'The backend is not reporting as online. Device cards will recover when the service responds.'
              : allDevicesOnline
                ? 'Everything is running normally. Updated just now.'
                : `${devicesStatus?.summary.offline || 0} device${devicesStatus?.summary.offline === 1 ? ' needs' : 's need'} attention. Updated just now.`}
          </p>
        </div>

        {(() => {
          const topAlert = alerts.find(a => !a.read) ?? alerts[0];
          const offlineCount = devicesStatus?.summary.offline || 0;
          const unreadCount = alerts.filter(a => !a.read).length;
          const urgentCount = alerts.filter(a => !a.read && a.level === 'IMPORTANT').length;
          return (!systemOnline || !allDevicesOnline || alerts.length > 0) && (
          <div className="g-pane dash-hero">
            <div>
              {/* Name the problem, then offer the fix. "Check the home status"
                  is a label, not information, and alert.message is the system
                  talking to itself ("hb_001: Command 'mic_stop' failed"). */}
              <h2>
                <span className={`g-dot ${systemOnline ? 'g-dot--warn' : 'g-dot--crit'}`}></span>{' '}
                {!systemOnline
                  ? 'The hub has stopped reporting'
                  : topAlert
                    ? getAlertTitle(topAlert)
                    : `${offlineCount} device${offlineCount === 1 ? ' has' : 's have'} stopped reporting`}
              </h2>
              <p>
                {!systemOnline
                  ? 'Nothing on this page is live until the service responds. Device controls are disabled to avoid sending commands into the dark.'
                  : topAlert
                    ? `${topAlert.source} · ${relativeTime(topAlert.timestamp)}`
                    : 'Open devices to see which ones, and when they were last heard from.'}
              </p>
              <div className="g-row g-row--wrap">
                <button className="g-btn g-btn--primary" onClick={() => openExpandedCard(alerts.length ? 'alerts' : 'system-status')}>
                  {topAlert ? 'See the alert' : 'Open devices'}
                </button>
                <button className="g-btn g-btn--ghost" onClick={() => openExpandedCard('system-status')}>Open devices</button>
              </div>
            </div>
            {/* A bare "50" says nothing. Name what is being counted and
                qualify it, the way the stat strip does. */}
            <div className={`g-tile ${systemOnline ? 'is-warn' : 'is-crit'}`}>
              <p className="g-label">{unreadCount ? 'Unread alerts' : 'Devices offline'}</p>
              <div className="g-metric-sm g-num">
                {unreadCount || offlineCount}
                <small>
                  {unreadCount
                    ? (urgentCount ? `${urgentCount} urgent` : 'none urgent')
                    : `of ${devicesStatus?.summary.total ?? 0}`}
                </small>
              </div>
            </div>
          </div>
        );
        })()}

        <div className="g-grid g-grid--4">
          <div className="g-pane g-card">
            <p className="g-label">Devices online</p>
            <div className="g-metric-sm g-num">{devicesStatus?.summary.online ?? 0}<small>of {devicesStatus?.summary.total ?? 0}</small></div>
          </div>
          <div className="g-pane g-card">
            <p className="g-label">Sensors reporting</p>
            <div className="g-metric-sm g-num">{gasReadings.length}<small>gas readings</small></div>
          </div>
          <div className={`g-pane g-card ${alerts.length ? 'is-warn' : ''}`}>
            <p className="g-label">Open alerts</p>
            <div className="g-metric-sm g-num">{alerts.length}</div>
          </div>
          <div className="g-pane g-card">
            <p className="g-label">Backend</p>
            <div className="g-metric-sm">{systemOnline ? 'Online' : 'Offline'}</div>
          </div>
        </div>

        <div className="dash-bento">
            <section
              className="g-pane g-card d-devices"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => handleCardKey(event, 'system-status')}
              onClick={() => openExpandedCard('system-status')}
            >
              <SystemStatusCard devicesStatus={devicesStatus} />
            </section>

            <section
              className="d-alerts"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => handleCardKey(event, 'alerts')}
              onClick={() => openExpandedCard('alerts')}
            >
              <AlertsCard alerts={alerts} onRefresh={fetchAlerts} />
            </section>

            <section
              className="d-climate"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => handleCardKey(event, 'temperature')}
              onClick={() => openExpandedCard('temperature')}
            >
              <TemperatureCard />
            </section>

            <section
              className="d-air"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => handleCardKey(event, 'gas')}
              onClick={() => openExpandedCard('gas')}
            >
              <GasReadingsCard gasReadings={gasReadings} onRefresh={fetchGasReadings} />
            </section>

            <section
              className="g-pane g-card d-doors"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => handleCardKey(event, 'doors')}
              onClick={() => openExpandedCard('doors')}
            >
              <DoorCard doorsWindows={doorsWindows} />
            </section>


            {user?.role === 'admin' && (
              <section
                className="g-pane g-card d-admin"
                role="button"
                tabIndex={0}
                onKeyDown={(event) => handleCardKey(event, 'admin')}
                onClick={() => openExpandedCard('admin')}
              >
                <AdminManagementCard devices={devicesStatus?.devices || []} />
              </section>
            )}
            
            <section
              className="g-pane g-card d-nfc"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => handleCardKey(event, 'nfc')}
              onClick={() => openExpandedCard('nfc')}
            >
              <NfcManagementCard />
            </section>

            <section
              className="g-pane g-card d-cast"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => handleCardKey(event, 'music')}
              onClick={() => openExpandedCard('music')}
            >
              <MusicBroadcastCard />
            </section>
        </div>

        {renderExpandedCard()}
      </main>
    </ProtectedRoute>
  );
}
