'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import GlassBar from '@/components/glass/GlassBar';
import { PageSkeleton } from '@/components/glass/Skeleton';
import { ModalPortal } from '@/components/glass/ModalPortal';
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

/* The modal used to title itself from the card id — "temperature",
   lowercase, over a card that then called itself "Climate" — and to explain
   every one of them with the same line, "Live details from Arduino888."
   Two titles for one thing, and a subtitle that named the service rather
   than saying what the panel is for. The heading is the card's name once,
   and the line under it says what you can do here. Cards opened this way
   are passed hideHeader so they do not repeat it. */
const CARD_HEADINGS: Record<string, { title: string; detail: string }> = {
  'system-status': { title: 'Devices', detail: 'Everything paired with the home, and when each one last reported.' },
  alerts: { title: 'Recent activity', detail: 'What the house has reported, most urgent first.' },
  temperature: { title: 'Climate', detail: 'Temperature and humidity in each room, over the past day.' },
  gas: { title: 'Air quality', detail: 'Gas readings from each sensor, over the past day.' },
  doors: { title: 'Doors', detail: 'Lock or unlock each door, and see battery and signal.' },
  admin: { title: 'Admin', detail: 'People, access roles, and enrolled boards.' },
  nfc: { title: 'NFC cards', detail: 'Cards are checked at the reader before a lock command is sent.' },
  music: { title: 'Broadcast', detail: 'Play an internet radio stream through your available speakers.' },
};

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
    /* Only when the section itself has focus. A key pressed on a control
       inside it — the door switch, a device button — belongs to that
       control, and used to open this modal on top of whatever it did. */
    if (event.target !== event.currentTarget) return;
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
  const offlineDevices = devicesStatus?.devices.filter(d => !d.online) ?? [];
  const byPriority = sortAlertsByPriority(alerts);

  /* One headline, chosen by what is actually worst — not by what happened
     most recently. A months-old log line used to outrank six offline
     devices simply because it was an alert. */
  const home = ((): {
    summary: string;
    headline: string | null;
    detail: string;
    tone: 'ok' | 'warn' | 'crit';
    action: { card: string; label: string };
    /* Evidence, not a restatement. This was a tile showing one number,
       and that number was always one the headline had already said —
       "6 devices have stopped reporting" beside "NOT REPORTING 6 of 6".
       Each branch now supplies the specifics the sentence cannot carry,
       so looking right is worth doing. Null when a branch genuinely has
       nothing to add; the pane goes single-column rather than render a
       half-empty grid. */
    aside: { label: string; items: { text: string; sub: string }[]; more: number } | null;
  } => {
    const offline = devicesStatus?.summary.offline ?? 0;
    const total = devicesStatus?.summary.total ?? 0;
    const topUrgent = byPriority.find(a => isUrgent(a));

    /* Which devices are quiet and since when. Shared by the hub-down and
       devices-offline branches — with the hub down nothing is current, so
       fall back to the whole list if none are flagged offline yet. */
    const quiet = (offlineDevices.length ? offlineDevices : (devicesStatus?.devices ?? [])).slice(0, 3);
    const quietAside = (count: number) => quiet.length
      ? {
          label: 'Last heard',
          items: quiet.map(d => ({
            text: deviceLabel(d),
            sub: d.last_seen ? relativeTime(d.last_seen) : 'no record',
          })),
          more: Math.max(0, count - quiet.length),
        }
      : null;

    if (!systemOnline) {
      return {
        summary: 'The home hub is not answering, so nothing here is live.',
        headline: 'The hub has stopped reporting',
        detail: 'Until it answers, readings on this page are the last ones we heard. Controls are disabled rather than sending commands into the dark.',
        tone: 'crit',
        action: { card: 'system-status', label: 'See the devices' },
        aside: quietAside(total),
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
        /* The headline names one room. What it cannot say is whether the
           rest of the house is clean — which is the difference between a
           local source and something spreading. */
        aside: {
          label: 'Every sensor now',
          items: [...liveGas]
            .sort((a, b) => b.ppm - a.ppm)
            .slice(0, 3)
            .map(g => ({ text: labelForId(g.sensor_id), sub: `${g.ppm.toFixed(0)} ppm` })),
          more: Math.max(0, liveGas.length - 3),
        },
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
        aside: {
          label: 'Unlocked since',
          items: unlockedLocks.slice(0, 3).map(d => ({
            text: d.name,
            sub: relativeTime(d.last_changed),
          })),
          more: Math.max(0, unlockedLocks.length - 3),
        },
      };
    }

    if (offline > 0) {
      return {
        summary: `${offline} ${offline === 1 ? 'device has' : 'devices have'} gone quiet. Readings from ${offline === 1 ? 'it' : 'them'} are not current.`,
        headline: `${offline} ${offline === 1 ? 'device has' : 'devices have'} stopped reporting`,
        detail: 'Their last readings are still shown, marked as not current. Check power and Wi-Fi at the board.',
        /* Every device dark is not the same event as some of them. It
           used to render amber either way, because only an unreachable
           hub could reach 'crit' — but a hub that answers while nothing
           behind it does is the identical situation for the resident. */
        tone: offline === total ? 'crit' : 'warn',
        action: { card: 'system-status', label: 'See which ones' },
        aside: quietAside(offline),
      };
    }

    if (topUrgent) {
      return {
        summary: 'Something needs a look. Everything else is normal.',
        headline: getAlertTitle(topUrgent),
        detail: `${labelForId(topUrgent.source)} · ${relativeTime(topUrgent.timestamp)}`,
        tone: 'warn',
        action: { card: 'alerts', label: 'See the alert' },
        /* What else came in around it — one alert alone means something
           different from one alert at the top of a run of them. Not
           filtered to urgent: with a single urgent alert that list is
           empty, and an empty column is what we are getting rid of. */
        aside: byPriority.length > 1
          ? {
              label: 'Also recent',
              items: byPriority.slice(1, 4).map(a => ({
                text: getAlertTitle(a),
                sub: relativeTime(a.timestamp),
              })),
              more: Math.max(0, byPriority.length - 4),
            }
          : null,
      };
    }

    return {
      summary: 'Everything is quiet. Doors locked, air clear, all devices reporting.',
      headline: null,
      detail: '',
      tone: 'ok',
      /* headline is null here, so the hero does not render at all — this
         branch only supplies the summary line under the greeting. */
      action: { card: 'alerts', label: 'What happened today' },
      aside: null,
    };
  })();

  if (loading) {
    return <PageSkeleton label="Checking doors, air and devices." variant="dashboard" />;
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
        content = <AlertsCard alerts={alerts} isExpanded={true} hideHeader onRefresh={fetchAlerts} />;
        break;
      case 'temperature':
        content = <TemperatureCard isExpanded={true} hideHeader />;
        break;
      case 'gas':
        content = <GasReadingsCard gasReadings={gasReadings} isExpanded={true} hideHeader onRefresh={fetchGasReadings} />;
        break;
      case 'doors':
        content = <DoorCard doorsWindows={doorsWindows} isExpanded={true} hideHeader />;
        break;
      case 'admin':
        // Only admins can view admin management
        if (user?.role === 'admin') {
          content = <AdminManagementCard devices={devicesStatus?.devices || []} isExpanded={true} hideHeader />;
        } else {
          content = null;
        }
        break;
      case 'nfc':
        content = <NfcManagementCard isExpanded={true} hideHeader />;
        break;
      case 'music':
        content = <MusicBroadcastCard isExpanded={true} />;
        break;

      default:
        content = null;
    }

    const modalHeading = CARD_HEADINGS[shownCard] ?? {
      title: shownCard.replace(/-/g, ' '),
      detail: 'Live details from Arduino888.',
    };
    const modalHeadingId = `dashboard-${shownCard}-title`;

    return (
      <ModalPortal>
        <div className={cardModal.className} role="dialog" aria-modal="true" aria-labelledby={modalHeadingId} onClick={closeExpandedCard}>
          <div className={`g-pane g-modal__card g-modal__card--wide ${shownCard === 'music' ? 'g-modal__card--broadcast' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="g-modal__head">
              <div>
                <h2 id={modalHeadingId}>{modalHeading.title}</h2>
                <p>{modalHeading.detail}</p>
              </div>
              <button className="g-icon-btn" onClick={closeExpandedCard} aria-label="Close">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* The card itself no longer scrolls — this does. The title and
                the close button used to slide away with the content, so a
                long list scrolled its own heading off the top. */}
            <div className="g-modal__body">{content}</div>
          </div>
        </div>
      </ModalPortal>
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
          <div
            className={`g-pane dash-hero ${home.tone === 'crit' ? 'is-crit' : home.tone === 'warn' ? 'is-warn' : ''} ${home.aside ? '' : 'dash-hero--solo'}`}
          >
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
                <span className={`g-dot g-dot--${home.tone}`} aria-hidden="true" />
                {home.headline}
              </h2>
              <p className="dash-hero__lede">{home.detail}</p>
              {/* One button. The second was hardcoded "What happened
                  today" on every state, and it opened the activity card
                  that is already on screen a few hundred pixels below. */}
              <div className="g-row g-row--wrap">
                <button className="g-btn g-btn--primary" onClick={() => openExpandedCard(home.action.card)}>
                  {home.action.label}
                </button>
              </div>
            </div>
            {home.aside && (
              <div className="g-tile dash-hero__aside">
                <p className="g-label">{home.aside.label}</p>
                <ul>
                  {home.aside.items.map((item, i) => (
                    <li key={`${item.text}-${i}`} className="dash-hero__ev">
                      <b>{item.text}</b>
                      <span>{item.sub}</span>
                    </li>
                  ))}
                </ul>
                {home.aside.more > 0 && (
                  <p className="dash-hero__more">and {home.aside.more} more</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* The four questions someone actually opens this page with: are the
            doors shut, is the air okay, how warm is it, is everything still
            talking. It used to be Devices online / Sensors reporting /
            Open alerts / Backend — three restatements of the header plus a
            service health readout no resident has a use for. */}
        {/* Each tile opens the card that can act on it — the same view the
            matching bento card opens, so the page has one behaviour rather
            than two. */}
        <div className="g-grid g-grid--4">
          <div
            className="g-pane g-card g-card--action"
            role="button"
            tabIndex={0}
            aria-label={`Doors: ${doorSummary.text}. Open the door locks.`}
            onKeyDown={(event) => handleCardKey(event, 'doors')}
            onClick={() => openExpandedCard('doors')}
          >
            <p className="g-label">Doors</p>
            <div className={`g-metric-word is-${doorSummary.tone}`}><i />{doorSummary.text}</div>
          </div>
          <div
            className="g-pane g-card g-card--action"
            role="button"
            tabIndex={0}
            aria-label={`Air: ${airSummary.text}. Open the air quality readings.`}
            onKeyDown={(event) => handleCardKey(event, 'gas')}
            onClick={() => openExpandedCard('gas')}
          >
            <p className="g-label">Air</p>
            <div className={`g-metric-word is-${airSummary.tone}`}><i />{airSummary.text}</div>
          </div>
          <div
            className={`g-pane g-card g-card--action ${urgent ? 'is-warn' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${urgent} urgent. Open recent activity.`}
            onKeyDown={(event) => handleCardKey(event, 'alerts')}
            onClick={() => openExpandedCard('alerts')}
          >
            <p className="g-label">Needs attention</p>
            {/* "urgent", not "since yesterday" — the count is not scoped to
                a day, and inventing a timeframe for a number is how the
                three contradictory alert counts started. */}
            <div className="g-metric-sm g-num">
              {urgent}
              <small>{urgent === 0 ? 'all clear' : 'urgent'}</small>
            </div>
          </div>
          <div
            className={`g-pane g-card g-card--action ${offlineTotal ? 'is-warn' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${devicesStatus?.summary.online ?? 0} of ${devicesStatus?.summary.total ?? 0} devices connected. Open the device list.`}
            onKeyDown={(event) => handleCardKey(event, 'system-status')}
            onClick={() => openExpandedCard('system-status')}
          >
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
