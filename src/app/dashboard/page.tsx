'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
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
import type { DevicesStatus, GasReading, Alert, DoorWindow } from '@/types/dashboard';
import { getCurrentTheme, toggleTheme as toggleGlassTheme, type GlassTheme } from '@/components/glass/theme';
import { getAlertTitle } from '@/utils/alertText';

export default function DashboardPage() {
  const router = useRouter();
  const { logout, user } = useAuth();
  const [devicesStatus, setDevicesStatus] = useState<DevicesStatus | null>(null);
  const [gasReadings, setGasReadings] = useState<GasReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState<GlassTheme>('light');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [systemOnline, setSystemOnline] = useState<boolean>(false);
  const [allDevicesOnline, setAllDevicesOnline] = useState<boolean>(false);
  const [doorLockStates, setDoorLockStates] = useState<Record<string, 'locked' | 'unlocked'>>({});


  const fetchAlerts = async () => {
    try {
      // Fetch all alerts with a limit of 50
      const alertsData = await getAlerts({ limit: 50 });
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
    const fetchData = async () => {
      try {
        // Fetch devices status
        const devices = await getAllDevices();
        setDevicesStatus(devices);

        // Check if all devices are online
        const allOnline = devices.summary.offline === 0 && devices.summary.total > 0;
        setAllDevicesOnline(allOnline);

        // Fetch gas sensor readings
        const gasData = await getGasReadingsForDashboard();
        setGasReadings(gasData);

        // Fetch alerts
        await fetchAlerts();

        // Fetch door lock statuses
        const doorLocks = devices.devices.filter(d => d.device_id.startsWith('dl_'));
        const lockStates: Record<string, 'locked' | 'unlocked'> = {};
        for (const lock of doorLocks) {
          try {
            const status = await getLockStatus(lock.device_id);
            if (status) {
              lockStates[lock.device_id] = status.lock_state;
            }
          } catch (error) {
            console.error(`Error fetching lock status for ${lock.device_id}:`, error);
          }
        }
        setDoorLockStates(lockStates);

        // Check system status via /info endpoint
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
          const response = await fetch(`${apiUrl}/info`, {
            method: 'GET',
          });

          if (response.ok) {
            const data = await response.text();
            setSystemOnline(data.includes('Arduino-888-SmartHome is running!'));
          } else {
            setSystemOnline(false);
          }
        } catch (infoError) {
          console.error('Error checking system status:', infoError);
          setSystemOnline(false);
        }
      } catch (error) {
        console.error('Error loading devices:', error);
        setSystemOnline(false);
        setAllDevicesOnline(false);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Refresh every 5 seconds for more real-time updates
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setThemeState(getCurrentTheme());
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

  const toggleTheme = () => {
    const next = toggleGlassTheme();
    setThemeState(next);
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

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
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>LOADING SYSTEM...</p>
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

  return (
    <ProtectedRoute>
      <main className="g-page">
        <div className="g-pane g-bar">
          <span className="g-bar__brand">Arduino888</span>
          <nav className="g-seg" data-choice aria-label="Sections">
            <a href="/dashboard" aria-current="page">Home</a>
            <a href="/">Plan</a>
            <a href="/dashboard">Access</a>
            <a href="/dashboard">Admin</a>
          </nav>
          <button className="g-icon-btn g-theme" onClick={toggleTheme} aria-label="Toggle theme" aria-pressed={theme === 'dark'}>
            <svg className="g-theme__moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M21 13.3A8.5 8.5 0 1 1 10.7 3a6.7 6.7 0 0 0 10.3 10.3Z" />
            </svg>
            <svg className="g-theme__sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          </button>
          <button className="g-btn g-btn--ghost" onClick={handleLogout}>Sign out</button>
          <span className={`g-pill ${systemOnline && allDevicesOnline ? 'is-ok' : 'is-warn'}`}>
            <i></i>
            {systemOnline && allDevicesOnline ? 'All systems normal' : `${devicesStatus?.summary.offline || 1} needs attention`}
          </span>
        </div>

        <div className="g-title">
          <h1>Good morning</h1>
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
                    ? `${topAlert.source} · ${new Date(topAlert.timestamp).toLocaleString()}`
                    : 'Open devices to see which ones, and when they were last heard from.'}
              </p>
              <div className="g-row g-row--wrap">
                <button className="g-btn g-btn--primary" onClick={() => openExpandedCard(alerts.length ? 'alerts' : 'system-status')}>
                  {topAlert ? 'See the alert' : 'Open devices'}
                </button>
                <button className="g-btn g-btn--ghost" onClick={() => openExpandedCard('system-status')}>Open devices</button>
              </div>
            </div>
            <div className={`g-tile ${systemOnline ? 'is-warn' : 'is-crit'}`}>
              <p className="g-label">Attention</p>
              <div className="g-metric-sm g-num">{alerts.length || devicesStatus?.summary.offline || 1}</div>
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
