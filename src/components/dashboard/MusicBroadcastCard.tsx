'use client';

import React, { useEffect, useId, useState } from 'react';
import { Bell, Home, Music2, Play, Square, Volume2, X } from 'lucide-react';
import { useModalTransition } from '@/components/glass/useModalTransition';
import { sendCommand, getAllDevices, findHubDevice } from '@/services/devices.service';
import type { Device } from '@/types/dashboard';

interface MusicBroadcastCardProps {
  isExpanded?: boolean;
}

type BroadcastTarget = 'doorbell' | 'hub' | 'both';
type NoticeTone = 'ok' | 'warn' | 'crit';

const presets = [
  { label: 'BBC World Service', value: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service_east_asia' },
  { label: 'Japan City Pop', value: 'https://play.streamafrica.net/japancitypop' },
  { label: 'Radio Paradise', value: 'http://stream.radioparadise.com/aac-128' },
];

function targetLabel(target: BroadcastTarget | null) {
  if (target === 'both') return 'both devices';
  if (target === 'hub') return 'the hub';
  if (target === 'doorbell') return 'the doorbell';
  return 'the selected device';
}

function targetIcon(target: BroadcastTarget) {
  const props = { size: 20, 'aria-hidden': true, color: 'currentColor' };
  if (target === 'doorbell') return <Bell {...props} />;
  if (target === 'hub') return <Home {...props} />;
  return <Music2 {...props} />;
}

export function MusicBroadcastCard({ isExpanded = false }: MusicBroadcastCardProps) {
  const volumeId = useId();
  const [streamUrl, setStreamUrl] = useState('http://stream.radioparadise.com/aac-320');
  const [volume, setVolume] = useState(10);
  const [target, setTarget] = useState<BroadcastTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [doorbellDevice, setDoorbellDevice] = useState<Device | null>(null);
  const [hubDevice, setHubDevice] = useState<Device | null>(null);
  const [notice, setNotice] = useState<{ tone: NoticeTone; title: string; message: string } | null>(null);
  /* Latched, so the card keeps its text while it animates out — the
     close handlers null the state immediately. */
  const noticeModal = useModalTransition(notice);
  const shownNotice = noticeModal.value;

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const devicesStatus = await getAllDevices();
        const doorbell = devicesStatus.devices.find((d) => d.type === 'doorbell');
        const hub = findHubDevice(devicesStatus.devices);

        setDoorbellDevice(doorbell || null);
        setHubDevice(hub || null);

        setTarget((prevTarget) => {
          if (prevTarget !== null) return prevTarget;

          const doorbellOnline = doorbell?.online || false;
          const hubOnline = hub?.online || false;

          if (doorbellOnline && hubOnline) return 'both';
          if (doorbellOnline) return 'doorbell';
          if (hubOnline) return 'hub';
          return null;
        });
      } catch (error) {
        console.error('Error fetching devices:', error);
      }
    };

    fetchDevices();
    const interval = setInterval(fetchDevices, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!notice) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotice(null);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [notice]);

  const showNotice = (tone: NoticeTone, title: string, message: string) => {
    setNotice({ tone, title, message });
  };

  const handlePlay = async () => {
    if (!streamUrl.trim()) {
      showNotice('warn', 'Add a stream URL', 'Enter a stream URL or choose a preset before starting playback.');
      return;
    }

    setLoading(true);
    try {
      const promises = [];

      if ((target === 'doorbell' || target === 'both') && doorbellDevice) {
        promises.push(
          sendCommand(doorbellDevice.device_id, 'amp_play', { url: streamUrl })
            .then(() => sendCommand(doorbellDevice.device_id, 'amp_volume', { level: volume }))
        );
      }

      if ((target === 'hub' || target === 'both') && hubDevice) {
        promises.push(
          sendCommand(hubDevice.device_id, 'amp_play', { url: streamUrl })
            .then(() => sendCommand(hubDevice.device_id, 'amp_volume', { level: volume }))
        );
      }

      if (promises.length === 0) {
        showNotice('warn', 'No speaker is available', 'Choose an online doorbell or hub before starting playback.');
        return;
      }

      await Promise.all(promises);
      showNotice('ok', 'Broadcast started', `Music is now playing on ${targetLabel(target)}.`);
    } catch (error) {
      console.error('Error broadcasting music:', error);
      showNotice('crit', 'Broadcast did not start', 'Check the selected device and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const promises = [];

      if ((target === 'doorbell' || target === 'both') && doorbellDevice) {
        promises.push(sendCommand(doorbellDevice.device_id, 'amp_stop'));
      }

      if ((target === 'hub' || target === 'both') && hubDevice) {
        promises.push(sendCommand(hubDevice.device_id, 'amp_stop'));
      }

      if (promises.length === 0) {
        showNotice('warn', 'No speaker is available', 'Choose an online doorbell or hub before stopping playback.');
        return;
      }

      await Promise.all(promises);
      showNotice('ok', 'Broadcast stopped', `Playback stopped on ${targetLabel(target)}.`);
    } catch (error) {
      console.error('Error stopping music:', error);
      showNotice('crit', 'Broadcast did not stop', 'Check the selected device and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
  };

  const handleVolumeSend = async (finalVolume: number) => {
    try {
      const promises = [];

      if ((target === 'doorbell' || target === 'both') && doorbellDevice) {
        promises.push(sendCommand(doorbellDevice.device_id, 'amp_volume', { level: finalVolume }));
      }

      if ((target === 'hub' || target === 'both') && hubDevice) {
        promises.push(sendCommand(hubDevice.device_id, 'amp_volume', { level: finalVolume }));
      }

      await Promise.all(promises);
      console.log(`Volume set to ${finalVolume} on ${target}`);
    } catch (error) {
      console.error('Error setting volume:', error);
    }
  };

  const isDeviceAvailable = (deviceTarget: BroadcastTarget | null) => {
    if (!deviceTarget) return false;
    if (deviceTarget === 'doorbell') return doorbellDevice?.online;
    if (deviceTarget === 'hub') return hubDevice?.online;
    return (doorbellDevice?.online || hubDevice?.online);
  };

  const TargetButton = ({
    value,
    online,
    label,
  }: {
    value: BroadcastTarget;
    online: boolean;
    label: string;
  }) => (
    <button
      className={`g-action ${target === value ? 'g-chip--ok' : ''}`}
      type="button"
      onClick={() => setTarget(value)}
      disabled={!online}
      aria-pressed={target === value}
    >
      <span className="g-row">
        {targetIcon(value)}
        <span>{label}</span>
      </span>
      <small>{online ? 'Online' : 'Offline'}</small>
    </button>
  );

  const volumeFill = `linear-gradient(to right, var(--accent) 0 ${(volume / 21) * 100}%, var(--sunken) ${(volume / 21) * 100}% 100%)`;

  return (
    <>
      <header>
        <h2>Broadcast</h2>
        <span className="g-label">{target ? targetLabel(target) : 'No target'}</span>
      </header>

      {!isExpanded ? (
        <div className="g-row">
          <div className="g-tile" aria-hidden="true">
            <Volume2 size={24} color="currentColor" />
          </div>
          {/* "Volume 10 of 21 · waiting for a device" is the control panel
              describing its own slider position. On the home page the only
              question is whether you can play something through the house
              right now. The volume lives in the expanded view, next to the
              slider that changes it. */}
          <div>
            <strong>{isDeviceAvailable(target) ? 'Ready to play' : 'No speaker available'}</strong>
            <p className="g-sub">
              {isDeviceAvailable(target)
                ? `Sound will come out of the ${target === 'both' ? 'doorbell and hub' : target}.`
                : 'The doorbell and hub are offline, so there is nothing to play through.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="g-stack">
          <div className="dash-modal-grid dash-modal-grid--2">
            <div className="g-tile">
              <p className="g-label">Target</p>
              <div className="g-grid g-grid--3" style={{ marginTop: 'var(--s-3)' }}>
                <TargetButton value="doorbell" label="Doorbell" online={Boolean(doorbellDevice?.online)} />
                <TargetButton value="hub" label="Hub" online={Boolean(hubDevice?.online)} />
                <TargetButton value="both" label="Both" online={Boolean(doorbellDevice?.online && hubDevice?.online)} />
              </div>
            </div>

            <div className="g-tile">
              <p className="g-label">Volume</p>
              <div className="g-field" style={{ marginTop: 'var(--s-3)' }}>
                <label htmlFor={volumeId}>Level · <output>{volume}</output> of 21</label>
                <input
                  id={volumeId}
                  className="g-slider"
                  type="range"
                  min="0"
                  max="21"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseInt(e.target.value, 10))}
                  onMouseUp={(e) => handleVolumeSend(parseInt((e.target as HTMLInputElement).value, 10))}
                  onTouchEnd={(e) => handleVolumeSend(parseInt((e.target as HTMLInputElement).value, 10))}
                  style={{ backgroundImage: volumeFill }}
                />
              </div>
            </div>
          </div>

          <div className="g-field">
            <label htmlFor="broadcast-stream-url">Stream URL</label>
            <div className="g-input-group">
              <input
                id="broadcast-stream-url"
                type="text"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder="Paste a stream URL"
              />
              <select value="" onChange={(e) => setStreamUrl(e.target.value)} aria-label="Choose a stream preset">
                <option value="">Preset</option>
                {presets.map(preset => (
                  <option key={preset.value} value={preset.value}>{preset.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="dash-modal-actions">
            <button
              className="g-btn g-btn--primary"
              type="button"
              onClick={handlePlay}
              disabled={loading || !isDeviceAvailable(target) || !streamUrl.trim()}
            >
              <Play size={16} aria-hidden="true" />
              {loading ? 'Starting' : 'Play'}
            </button>
            <button
              className="g-btn g-btn--ghost"
              type="button"
              onClick={handleStop}
              disabled={loading || !isDeviceAvailable(target)}
            >
              <Square size={16} aria-hidden="true" />
              {loading ? 'Stopping' : 'Stop'}
            </button>
          </div>
        </div>
      )}

      {noticeModal.render && shownNotice && (
        <div className={noticeModal.className} role="dialog" aria-modal="true" aria-labelledby="broadcast-notice-title" onClick={() => setNotice(null)}>
          <div className="g-pane g-modal__card" onClick={(event) => event.stopPropagation()}>
            <div className="g-modal__head">
              <div>
                <h2 id="broadcast-notice-title">{shownNotice.title}</h2>
                <p>{shownNotice.message}</p>
              </div>
              <button className="g-icon-btn" type="button" aria-label="Close" onClick={() => setNotice(null)}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="g-modal__foot">
              <button className={`g-btn ${shownNotice.tone === 'crit' ? 'g-btn--danger' : 'g-btn--primary'}`} type="button" onClick={() => setNotice(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
