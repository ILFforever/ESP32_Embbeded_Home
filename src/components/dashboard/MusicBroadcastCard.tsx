'use client';

import React, { useState, useEffect } from 'react';
import { Volume2, Play, Square } from 'lucide-react';
import { sendCommand, getAllDevices, findHubDevice } from '@/services/devices.service';
import type { Device } from '@/types/dashboard';

interface MusicBroadcastCardProps {
  isExpanded?: boolean;
}

export function MusicBroadcastCard({ isExpanded = false }: MusicBroadcastCardProps) {
  const [streamUrl, setStreamUrl] = useState('http://stream.radioparadise.com/aac-320');
  const [volume, setVolume] = useState(10);
  const [target, setTarget] = useState<'doorbell' | 'hub' | 'both' | null>(null);
  const [loading, setLoading] = useState(false);
  const [doorbellDevice, setDoorbellDevice] = useState<Device | null>(null);
  const [hubDevice, setHubDevice] = useState<Device | null>(null);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const devicesStatus = await getAllDevices();
        const doorbell = devicesStatus.devices.find((d) => d.type === 'doorbell');
        const hub = findHubDevice(devicesStatus.devices);

        setDoorbellDevice(doorbell || null);
        setHubDevice(hub || null);

        // Set default target based on online status (only on first load)
        setTarget((prevTarget) => {
          if (prevTarget !== null) return prevTarget; // Don't override user selection

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
    // Refresh device status every 5 seconds
    const interval = setInterval(fetchDevices, 5000);
    return () => clearInterval(interval);
  }, []);

  const handlePlay = async () => {
    if (!streamUrl.trim()) {
      alert('Please enter a stream URL');
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
        alert('No devices available for selected target');
        return;
      }

      await Promise.all(promises);
      alert(`Music broadcast started on ${target}!`);
    } catch (error) {
      console.error('Error broadcasting music:', error);
      alert('Failed to broadcast music. Please try again.');
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
        alert('No devices available for selected target');
        return;
      }

      await Promise.all(promises);
      alert(`Music broadcast stopped on ${target}!`);
    } catch (error) {
      console.error('Error stopping music:', error);
      alert('Failed to stop music. Please try again.');
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

  const isDeviceAvailable = (deviceTarget: 'doorbell' | 'hub' | 'both' | null) => {
    if (!deviceTarget) return false;
    if (deviceTarget === 'doorbell') return doorbellDevice?.online;
    if (deviceTarget === 'hub') return hubDevice?.online;
    return (doorbellDevice?.online || hubDevice?.online);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          <Volume2 size={20} />
          <h3>MUSIC BROADCAST</h3>
        </div>
      </div>
      <div className="card-content">
        {!isExpanded ? (
          /* Compact view */
          <div className="control-panel">
            <div className="control-status">
              <Volume2 size={48} className="status-info-large" />
              <div className="status-label">
                <span className="status-text">BROADCAST AUDIO</span>
                <span className="status-description">
                  Click to expand
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Expanded view */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '8px' }}>
            {/* Target Selection Section */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '12px',
                fontSize: '13px',
                fontWeight: '700',
                color: 'var(--ink)',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                Broadcast Target
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <button
                  className={`btn-control ${target === 'doorbell' ? 'btn-start' : ''}`}
                  onClick={() => setTarget('doorbell')}
                  disabled={!doorbellDevice?.online}
                  style={{
                    padding: '16px',
                    fontSize: '14px',
                    fontWeight: '600',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    background: target === 'doorbell' ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-secondary)',
                    border: target === 'doorbell' ? '2px solid rgb(59, 130, 246)' : '2px solid var(--border-color)',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease',
                    color: 'var(--ink)'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>🔔</span>
                  <span>Doorbell</span>
                  <span style={{ fontSize: '11px', color: doorbellDevice?.online ? 'var(--ok)' : 'var(--accent)' }}>
                    {doorbellDevice?.online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </button>
                <button
                  className={`btn-control ${target === 'hub' ? 'btn-start' : ''}`}
                  onClick={() => setTarget('hub')}
                  disabled={!hubDevice?.online}
                  style={{
                    padding: '16px',
                    fontSize: '14px',
                    fontWeight: '600',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    background: target === 'hub' ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-secondary)',
                    border: target === 'hub' ? '2px solid rgb(59, 130, 246)' : '2px solid var(--border-color)',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease',
                    color: 'var(--ink)'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>🏠</span>
                  <span>Hub</span>
                  <span style={{ fontSize: '11px', color: hubDevice?.online ? 'var(--ok)' : 'var(--accent)' }}>
                    {hubDevice?.online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </button>
                <button
                  className={`btn-control ${target === 'both' ? 'btn-start' : ''}`}
                  onClick={() => setTarget('both')}
                  disabled={!doorbellDevice?.online || !hubDevice?.online}
                  style={{
                    padding: '16px',
                    fontSize: '14px',
                    fontWeight: '600',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    background: target === 'both' ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-secondary)',
                    border: target === 'both' ? '2px solid rgb(59, 130, 246)' : '2px solid var(--border-color)',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease',
                    color: 'var(--ink)',
                    opacity: (!doorbellDevice?.online || !hubDevice?.online) ? 0.5 : 1,
                    cursor: (!doorbellDevice?.online || !hubDevice?.online) ? 'not-allowed' : 'pointer'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>🎵</span>
                  <span>Both</span>
                  <span style={{ fontSize: '11px', color: (doorbellDevice?.online && hubDevice?.online) ? 'var(--ok)' : 'var(--accent)' }}>
                    {(doorbellDevice?.online && hubDevice?.online) ? 'READY' : 'OFFLINE'}
                  </span>
                </button>
              </div>
            </div>

            {/* Stream URL Section */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '12px',
                fontSize: '13px',
                fontWeight: '700',
                color: 'var(--ink)',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                Stream URL
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input
                  type="text"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="Enter stream URL or select a preset"
                  className="control-input"
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    borderRadius: '8px',
                    border: '2px solid var(--border-color)',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    transition: 'all 0.2s ease',
                    outline: 'none',
                    background: 'var(--bg-secondary)',
                    color: 'var(--ink)'
                  }}
                />
                <select
                  onChange={(e) => setStreamUrl(e.target.value)}
                  value=""
                  className="stream-selector"
                  style={{
                    padding: '14px 16px',
                    borderRadius: '8px',
                    border: '2px solid var(--border-color)',
                    fontSize: '14px',
                    background: 'var(--bg-secondary)',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    outline: 'none',
                    minWidth: '180px'
                  }}
                >
                  <option value="" style={{ background: 'var(--modal-bg)', color: 'var(--ink)' }}>
                    Select Preset
                  </option>
                  <option
                    value="https://stream.live.vc.bbcmedia.co.uk/bbc_world_service_east_asia"
                    style={{ background: 'var(--modal-bg)', color: 'var(--ink)' }}
                  >
                    BBC World Service
                  </option>
                  <option
                    value="https://play.streamafrica.net/japancitypop"
                    style={{ background: 'var(--modal-bg)', color: 'var(--ink)' }}
                  >
                    Japan City Pop
                  </option>
                  <option
                    value="http://stream.radioparadise.com/aac-128"
                    style={{ background: 'var(--modal-bg)', color: 'var(--ink)' }}
                  >
                    Radio Paradise
                  </option>
                </select>
              </div>
            </div>

            {/* Volume Control Section */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '12px',
                fontSize: '13px',
                fontWeight: '700',
                color: 'var(--ink)',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                Volume: {volume} / 21
              </label>
              <div style={{
                padding: '20px',
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
              }}>
                <input
                  type="range"
                  min="0"
                  max="21"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                  onMouseUp={(e) => handleVolumeSend(parseInt((e.target as HTMLInputElement).value))}
                  onTouchEnd={(e) => handleVolumeSend(parseInt((e.target as HTMLInputElement).value))}
                  className="volume-slider"
                  style={{
                    width: '100%',
                    height: '8px',
                    borderRadius: '4px',
                    background: `linear-gradient(to right, var(--ok) 0%, var(--ok) ${(volume / 21) * 100}%, var(--border-color) ${(volume / 21) * 100}%, var(--border-color) 100%)`,
                    outline: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                />
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '12px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)'
                }}>
                  <span>Mute</span>
                  <span>Max</span>
                </div>
              </div>
            </div>

            {/* Control Buttons Section */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <button
                className="btn-control btn-start"
                onClick={handlePlay}
                disabled={loading || !isDeviceAvailable(target) || !streamUrl.trim()}
                style={{
                  padding: '18px',
                  fontSize: '16px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  border: 'none',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease',
                  boxShadow: 'var(--shadow-md)',
                  color: 'var(--ink)',
                  cursor: loading || !isDeviceAvailable(target) || !streamUrl.trim() ? 'not-allowed' : 'pointer',
                  opacity: loading || !isDeviceAvailable(target) || !streamUrl.trim() ? 0.5 : 1
                }}
              >
                <Play size={20} />
                {loading ? 'BROADCASTING...' : 'PLAY'}
              </button>
              <button
                className="btn-control btn-stop"
                onClick={handleStop}
                disabled={loading || !isDeviceAvailable(target)}
                style={{
                  padding: '18px',
                  fontSize: '16px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  background: 'var(--danger)',
                  border: 'none',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease',
                  boxShadow: 'var(--shadow-md)',
                  color: 'var(--ink)',
                  cursor: loading || !isDeviceAvailable(target) ? 'not-allowed' : 'pointer',
                  opacity: loading || !isDeviceAvailable(target) ? 0.5 : 1
                }}
              >
                <Square size={20} />
                {loading ? 'STOPPING...' : 'STOP'}
              </button>
            </div>


          </div>
        )}
      </div>
    </div>
  );
}
