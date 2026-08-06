'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import GlassBar from '@/components/glass/GlassBar';
import { useModalTransition } from '@/components/glass/useModalTransition';
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
import { countUrgent, isUrgent, sortAlertsByPriority } from '@/utils/alertScoring';
import { deviceLabel, labelForId, roomName } from '@/utils/deviceNames';
import { greeting, relativeTime } from '@/utils/time';

export default function DashboardPage() {
  const { user } = useAuth();
  const [devicesStatus, setDevicesStatus] = useState<DevicesStatus | null>(null);
  const [gasReadings, setGasReadings] = useState<GasReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  /* Latched: closing clears expandedCard, and without this the dialog
     would lose its title and body on the first frame of its exit. */
  const cardModal = useModalTransition(expandedCard);
  const shownCard = cardModal.value;
  const [systemOnline, setSystemOnline] = useState<boolean>(false);
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
      } catch (error) {
        console.error('Error loading devices:', error);
        setSystemOnline(false);
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
      // Not device_id. "dl_001" was the label on the Doors card.
      name: deviceLabel(device),
      location: roomName(device.device_id) ?? 'Door',
      type: 'door' as const,
      status: doorLockStates[device.device_id] || 'locked',
      last_changed: device.last_seen || new Date().toISOString(),
      battery: device.battery,
      online: device.online
    })) || [];

  /* Everything below reads the house, not the service.
     A reading from an offline device is not a reading — it is the last
     thing we heard before it went quiet, and presenting it as current is
     the one mistake this page must not make. */
  const onlineLocks = doorsWindows.filter(d => d.online);
  const unlockedLocks = onlineLocks.filter(d => d.status !== 'locked');
  const doorSummary: { text: string; tone: 'ok' | 'warn' | 'off' } =
    doorsWindows.length === 0
      ? { text: 'None paired', tone: 'off' }
      : onlineLocks.length === 0
        ? { text: 'Not reporting', tone: 'off' }
        : unlockedLocks.length > 0
          ? { text: `${unlockedLocks.length} unlocked`, tone: 'warn' }
          : { text: 'All locked', tone: 'ok' };

  const liveGas = gasReadings.filter(g => g.online !== false);
  const worstGas = liveGas.find(g => g.status === 'danger') ?? liveGas.find(g => g.status === 'warning');
  const airSummary: { text: string; tone: 'ok' | 'warn' | 'off' } =
    gasReadings.length === 0
      ? { text: 'No sensors', tone: 'off' }
      : liveGas.length === 0
        ? { text: 'Not reporting', tone: 'off' }
        : worstGas?.status === 'danger'
          ? { text: 'Gas detected', tone: 'warn' }
          : worstGas
            ? { text: 'Raised', tone: 'warn' }
            : { text: 'Clear', tone: 'ok' };

  const urgent = countUrgent(alerts);

  /* One headline, chosen by what is actually worst — not by what happened
     most recently. A months-old log line used to outrank six offline
     devices simply because it was an alert. */
  const home = ((): {
    summary: string;
    headline: string | null;
    detail: string;
    tone: 'ok' | 'warn' | 'crit';
    action: { card: string; label: string };
    /* The tile beside the headline restates the headline's own number.
       It used to always show the alert count, which the stat strip below
       already carries — the same "37 urgent" twice, 200px apart. */
    tile: { label: string; value: string; small: string };
  } => {
    const offline = devicesStatus?.summary.offline ?? 0;
    const topUrgent = sortAlertsByPriority(alerts).find(a => isUrgent(a));

    if (!systemOnline) {
      return {
        summary: 'The home hub is not answering, so nothing here is live.',
        headline: 'The hub has stopped reporting',
        detail: 'Until it answers, readings on this page are the last ones we heard. Controls are disabled rather than sending commands into the dark.',
        tone: 'crit',
        action: { card: 'system-status', label: 'See the devices' },
        tile: { label: 'Connected', value: '0', small: `of ${devicesStatus?.summary.total ?? 0}` },
      };
    }

    if (worstGas?.status === 'danger') {
      const where = labelForId(worstGas.sensor_id);
      return {
        summary: `Gas is above the safe level near the ${where.toLowerCase()}.`,
        headline: `Gas above the safe level · ${where}`,
        detail: `${worstGas.ppm.toFixed(0)} ppm, ${relativeTime(worstGas.last_seen)}. Ventilate the room and check the source.`,
        tone: 'crit',
        action: { card: 'gas', label: 'See the readings' },
        tile: { label: 'Gas level', value: worstGas.ppm.toFixed(0), small: 'ppm' },
      };
    }

    if (unlockedLocks.length > 0) {
      const door = unlockedLocks[0];
      return {
        summary: `${unlockedLocks.length === 1 ? 'A door is' : `${unlockedLocks.length} doors are`} unlocked. Everything else looks normal.`,
        headline: unlockedLocks.length === 1
          ? `${deviceLabel({ device_id: door.id, name: door.name })} is unlocked`
          : `${unlockedLocks.length} doors are unlocked`,
        detail: `Since ${relativeTime(door.last_changed)}. You can lock up from here.`,
        tone: 'warn',
        action: { card: 'doors', label: 'Lock up' },
        tile: {
          label: 'Unlocked',
          value: String(unlockedLocks.length),
          small: `of ${onlineLocks.length} ${onlineLocks.length === 1 ? 'door' : 'doors'}`,
        },
      };
    }

    if (offline > 0) {
      return {
        summary: `${offline} ${offline === 1 ? 'device has' : 'devices have'} gone quiet. Readings from ${offline === 1 ? 'it' : 'them'} are not current.`,
        headline: `${offline} ${offline === 1 ? 'device has' : 'devices have'} stopped reporting`,
        detail: 'Their last readings are still shown, marked as not current. Check power and Wi-Fi at the board.',
        tone: 'warn',
        action: { card: 'system-status', label: 'See which ones' },
        tile: {
          label: 'Not reporting',
          value: String(offline),
          small: `of ${devicesStatus?.summary.total ?? 0}`,
        },
      };
    }

    if (topUrgent) {
      return {
        summary: 'Something needs a look. Everything else is normal.',
        headline: getAlertTitle(topUrgent),
        detail: `${labelForId(topUrgent.source)} · ${relativeTime(topUrgent.timestamp)}`,
        tone: 'warn',
        action: { card: 'alerts', label: 'See the alert' },
        tile: { label: 'Needs attention', value: String(urgent), small: 'urgent' },
      };
    }

    return {
      summary: 'Everything is quiet. Doors locked, air clear, all devices reporting.',
      headline: null,
      detail: '',
      tone: 'ok',
      action: { card: 'alerts', label: 'What happened today' },
      tile: { label: 'Needs attention', value: '0', small: 'all clear' },
    };
  })();

  if (loading) {
    return (
      <div className="g-waiting">
        <div className="g-waiting__inner">
          <div className="g-spinner" aria-hidden="true" />
          <h1>{greeting()}</h1>
          <p aria-live="polite">Checking doors, air and devices.</p>
        </div>
      </div>
    );
  }

  // Render expanded card content with more details
  const renderExpandedCard = () => {
    if (!cardModal.render || !shownCard) return null;

    let content;
    switch (shownCard) {
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
      <div className={cardModal.className} role="dialog" aria-modal="true" onClick={closeExpandedCard}>
        <div className="g-pane g-modal__card g-modal__card--wide" onClick={(e) => e.stopPropagation()}>
          <div className="g-modal__head">
            <div>
              <h2>{shownCard.replace(/-/g, ' ')}</h2>
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
        <GlassBar current="home" />

        <div className="g-title">
          <h1>{greeting()}</h1>
          <p>{home.summary}</p>
        </div>

        {home.headline && (
          <div className="g-pane dash-hero">
            <div>
              {/* Whatever is actually wrong, named the way a person would
                  say it. This used to lead with the newest alert whatever
                  it was, so the top of the home page read "Command
                  'mic_stop' failed · hb_001 · Mar 23" — the system talking
                  to itself, about something that happened in March, while
                  six devices sat offline unmentioned. Order now: the hub,
                  then doors, then devices, then a genuinely urgent recent
                  alert. */}
              <h2>
                <span className={`g-dot g-dot--${home.tone}`} />{' '}
                {home.headline}
              </h2>
              <p>{home.detail}</p>
              <div className="g-row g-row--wrap">
                <button className="g-btn g-btn--primary" onClick={() => openExpandedCard(home.action.card)}>
                  {home.action.label}
                </button>
                <button className="g-btn g-btn--ghost" onClick={() => openExpandedCard('alerts')}>
                  What happened today
                </button>
              </div>
            </div>
            <div className={`g-tile ${home.tone === 'crit' ? 'is-crit' : home.tone === 'warn' ? 'is-warn' : ''}`}>
              <p className="g-label">{home.tile.label}</p>
              <div className="g-metric-sm g-num">
                {home.tile.value}
                <small>{home.tile.small}</small>
              </div>
            </div>
          </div>
        )}

        {/* The four questions someone actually opens this page with: are the
            doors shut, is the air okay, how warm is it, is everything still
            talking. It used to be Devices online / Sensors reporting /
            Open alerts / Backend — three restatements of the header plus a
            service health readout no resident has a use for. */}
        <div className="g-grid g-grid--4">
          <div className="g-pane g-card">
            <p className="g-label">Doors</p>
            <div className={`g-metric-word is-${doorSummary.tone}`}><i />{doorSummary.text}</div>
          </div>
          <div className="g-pane g-card">
            <p className="g-label">Air</p>
            <div className={`g-metric-word is-${airSummary.tone}`}><i />{airSummary.text}</div>
          </div>
          <div className={`g-pane g-card ${urgent ? 'is-warn' : ''}`}>
            <p className="g-label">Needs attention</p>
            {/* "urgent", not "since yesterday" — the count is not scoped to
                a day, and inventing a timeframe for a number is how the
                three contradictory alert counts started. */}
            <div className="g-metric-sm g-num">
              {urgent}
              <small>{urgent === 0 ? 'all clear' : 'urgent'}</small>
            </div>
          </div>
          <div className={`g-pane g-card ${offlineTotal ? 'is-warn' : ''}`}>
            <p className="g-label">Connected</p>
            <div className="g-metric-sm g-num">
              {devicesStatus?.summary.online ?? 0}
              <small>of {devicesStatus?.summary.total ?? 0} devices</small>
            </div>
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


            {/* The Admin tile is gone from the home page. "Admins 4 · Users 1
                · Devices 6" is a console readout, and it now has a page of
                its own at /admin, one nav click away. */}
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
