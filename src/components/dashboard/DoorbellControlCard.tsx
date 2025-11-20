import React, { useState } from 'react';
import { Camera, Mic, UserCheck, Bell, Volume2, RotateCw, Power, Users, Database } from 'lucide-react';
import type { DoorbellControl } from '@/types/dashboard';
import {
  startCamera,
  stopCamera,
  restartCamera,
  startMicrophone,
  stopMicrophone,
  playAmplifier,
  stopAmplifier,
  restartAmplifier,
  syncFaceDatabase,
  restartSystem
} from '@/services/devices.service';

interface DoorbellControlCardProps {
  doorbellControl: DoorbellControl;
  deviceId?: string;
  isExpanded?: boolean;
}

export function DoorbellControlCard({ doorbellControl, deviceId, isExpanded = false }: DoorbellControlCardProps) {
  const [cameraActive, setCameraActive] = useState(doorbellControl.camera_active);
  const [micActive, setMicActive] = useState(doorbellControl.mic_active);
  const [faceRecognition, setFaceRecognition] = useState(doorbellControl.face_recognition);
  const [loading, setLoading] = useState<string | null>(null);
  const [ampUrl, setAmpUrl] = useState('http://stream.radioparadise.com/aac-320');
  const [faceCount, setFaceCount] = useState<number | null>(null);

  const handleCameraToggle = async () => {
    if (!deviceId) {
      console.error('No doorbell device ID available');
      return;
    }

    setLoading('camera');
    try {
      if (cameraActive) {
        await stopCamera(deviceId);
      } else {
        await startCamera(deviceId);
      }
      setCameraActive(!cameraActive);
    } catch (error) {
      console.error('Error toggling camera:', error);
    } finally {
      setLoading(null);
    }
  };

  const handleCameraRestart = async () => {
    if (!deviceId) return;

    setLoading('camera_restart');
    try {
      await restartCamera(deviceId);
      alert('Camera restart command sent');
    } catch (error) {
      console.error('Error restarting camera:', error);
      alert('Failed to restart camera');
    } finally {
      setLoading(null);
    }
  };

  const handleMicToggle = async () => {
    if (!deviceId) {
      console.error('No doorbell device ID available');
      return;
    }

    setLoading('mic');
    try {
      if (micActive) {
        await stopMicrophone(deviceId);
      } else {
        await startMicrophone(deviceId);
      }
      setMicActive(!micActive);
    } catch (error) {
      console.error('Error toggling mic:', error);
    } finally {
      setLoading(null);
    }
  };

  const handleFaceRecognitionToggle = () => {
    setFaceRecognition(!faceRecognition);
  };

  const handlePlayAmplifier = async () => {
    if (!deviceId || !ampUrl) return;

    setLoading('amp_play');
    try {
      await playAmplifier(deviceId, ampUrl);
      alert('Amplifier play command sent');
    } catch (error) {
      console.error('Error playing amplifier:', error);
      alert('Failed to play amplifier');
    } finally {
      setLoading(null);
    }
  };

  const handleStopAmplifier = async () => {
    if (!deviceId) return;

    setLoading('amp_stop');
    try {
      await stopAmplifier(deviceId);
      alert('Amplifier stopped');
    } catch (error) {
      console.error('Error stopping amplifier:', error);
      alert('Failed to stop amplifier');
    } finally {
      setLoading(null);
    }
  };

  const handleRestartAmplifier = async () => {
    if (!deviceId) return;

    setLoading('amp_restart');
    try {
      await restartAmplifier(deviceId);
      alert('Amplifier restart command sent');
    } catch (error) {
      console.error('Error restarting amplifier:', error);
      alert('Failed to restart amplifier');
    } finally {
      setLoading(null);
    }
  };

  const handleSyncDatabase = async () => {
    if (!deviceId) return;

    setLoading('sync_database');
    try {
      // Call single sync endpoint - backend/ESP32 handles all three operations
      await syncFaceDatabase(deviceId);
      console.log('✓ Face database sync command queued');

      alert('Database sync command queued!\n\nThe device will execute:\n• Face count\n• Database check\n• Face list\n\nCheck device serial output for results.');
    } catch (error) {
      console.error('Error syncing database:', error);
      alert('Failed to sync database.');
    } finally {
      setLoading(null);
    }
  };

  const handleSystemRestart = async () => {
    if (!deviceId) return;

    if (!confirm('Are you sure you want to restart the doorbell system? It will be offline for about 30 seconds.')) {
      return;
    }

    setLoading('system_restart');
    try {
      await restartSystem(deviceId);
      alert('System restart command sent. Device will reboot shortly.');
    } catch (error) {
      console.error('Error restarting system:', error);
      alert('Failed to restart system');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          <Bell size={20} />
          <h3>DOORBELL CONTROL</h3>
        </div>
      </div>

      <div className="card-content">
        {!isExpanded ? (
          /* Compact view */
          <div className="doorbell-compact">
            <div className="doorbell-status-grid">
              <div className="status-item">
                <Camera size={20} className={cameraActive ? 'status-active' : 'status-inactive'} />
                <span>{cameraActive ? 'CAMERA ON' : 'CAMERA OFF'}</span>
              </div>
              <div className="status-item">
                <Mic size={20} className={micActive ? 'status-active' : 'status-inactive'} />
                <span>{micActive ? 'MIC ON' : 'MIC OFF'}</span>
              </div>
              <div className="status-item">
                <UserCheck size={20} className={faceRecognition ? 'status-active' : 'status-inactive'} />
                <span>{faceRecognition ? 'FACE REC ON' : 'FACE REC OFF'}</span>
              </div>
            </div>
            <div className="doorbell-stats">
              <p>VISITORS TODAY: {doorbellControl.visitor_count_today}</p>
              <p>
                LAST ACTIVITY: {doorbellControl.last_activity
                  ? new Date(doorbellControl.last_activity).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : 'No Activity'}
              </p>
            </div>
          </div>
        ) : (
          /* Expanded view */
          <div className="doorbell-expanded">
            <div className="control-section">
              <h4>CAMERA CONTROL</h4>
              <div className="control-panel">
                <div className="control-status">
                  <Camera size={48} className={cameraActive ? 'status-active-large' : 'status-inactive-large'} />
                  <div className="status-label">
                    <span className="status-text">{cameraActive ? 'ACTIVE' : 'INACTIVE'}</span>
                    <span className="status-description">
                      {cameraActive ? 'Camera is streaming video' : 'Camera is off'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    className={`btn-control ${cameraActive ? 'btn-stop' : 'btn-start'}`}
                    onClick={handleCameraToggle}
                    disabled={loading === 'camera'}
                  >
                    {loading === 'camera' ? 'PROCESSING...' : cameraActive ? 'STOP CAMERA' : 'START CAMERA'}
                  </button>
                  <button
                    className="btn-control btn-warning"
                    onClick={handleCameraRestart}
                    disabled={loading === 'camera_restart'}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <RotateCw size={16} />
                    {loading === 'camera_restart' ? 'RESTARTING...' : 'RESTART CAMERA'}
                  </button>
                </div>
              </div>
            </div>

            <div className="control-section">
              <h4>MICROPHONE CONTROL</h4>
              <div className="control-panel">
                <div className="control-status">
                  <Mic size={48} className={micActive ? 'status-active-large' : 'status-inactive-large'} />
                  <div className="status-label">
                    <span className="status-text">{micActive ? 'ACTIVE' : 'INACTIVE'}</span>
                    <span className="status-description">
                      {micActive ? 'Microphone is listening' : 'Microphone is muted'}
                    </span>
                  </div>
                </div>
                <button
                  className={`btn-control ${micActive ? 'btn-stop' : 'btn-start'}`}
                  onClick={handleMicToggle}
                  disabled={loading === 'mic'}
                >
                  {loading === 'mic' ? 'PROCESSING...' : micActive ? 'STOP MIC' : 'START MIC'}
                </button>
              </div>
            </div>

            <div className="control-section">
              <h4>AUDIO AMPLIFIER</h4>
              <div className="control-panel">
                <div className="control-status">
                  <Volume2 size={48} className="status-info-large" />
                  <div className="status-label">
                    <span className="status-text">AMPLIFIER</span>
                    <span className="status-description">Stream audio to amplifier</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                  <input
                    type="text"
                    value={ampUrl}
                    onChange={(e) => setAmpUrl(e.target.value)}
                    placeholder="Stream URL"
                    className="control-input"
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn-control btn-start"
                      onClick={handlePlayAmplifier}
                      disabled={loading === 'amp_play'}
                      style={{ flex: 1 }}
                    >
                      {loading === 'amp_play' ? 'SENDING...' : 'PLAY'}
                    </button>
                    <button
                      className="btn-control btn-stop"
                      onClick={handleStopAmplifier}
                      disabled={loading === 'amp_stop'}
                      style={{ flex: 1 }}
                    >
                      {loading === 'amp_stop' ? 'STOPPING...' : 'STOP'}
                    </button>
                    <button
                      className="btn-control btn-warning"
                      onClick={handleRestartAmplifier}
                      disabled={loading === 'amp_restart'}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    >
                      <RotateCw size={14} />
                      {loading === 'amp_restart' ? '...' : 'RESTART'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="control-section">
              <h4>FACE RECOGNITION</h4>
              <div className="control-panel">
                <div className="control-status">
                  <UserCheck size={48} className={faceRecognition ? 'status-active-large' : 'status-inactive-large'} />
                  <div className="status-label">
                    <span className="status-text">{faceRecognition ? 'TRIGGERED' : 'IDLE'}</span>
                    <span className="status-description">
                      {faceRecognition ? 'Identifying visitors' : 'Face recognition idle'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    className={`btn-control ${faceRecognition ? 'btn-stop' : 'btn-start'}`}
                    onClick={handleFaceRecognitionToggle}
                  >
                    {faceRecognition ? 'IDLE' : 'TRIGGER'}
                  </button>
                  <button
                    className="btn-control btn-warning"
                    onClick={handleSyncDatabase}
                    disabled={loading === 'sync_database'}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 auto' }}
                  >
                    <Database size={16} />
                    {loading === 'sync_database' ? 'SYNCING...' : 'SYNC DATABASE'}
                  </button>
                </div>
              </div>
            </div>

            <div className="control-section">
              <h4>SYSTEM CONTROL</h4>
              <div className="control-panel">
                <div className="control-status">
                  <Power size={48} className="status-danger-large" />
                  <div className="status-label">
                    <span className="status-text">SYSTEM POWER</span>
                    <span className="status-description">Restart the doorbell device</span>
                  </div>
                </div>
                <button
                  className="btn-control btn-danger"
                  onClick={handleSystemRestart}
                  disabled={loading === 'system_restart'}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <RotateCw size={16} />
                  {loading === 'system_restart' ? 'RESTARTING...' : 'RESTART SYSTEM'}
                </button>
              </div>
            </div>

            <div className="control-section">
              <h4>ACTIVITY</h4>
              <div className="activity-stats">
                <div className="stat-item">
                  <span className="stat-label">VISITORS TODAY:</span>
                  <span className="stat-value">{doorbellControl.visitor_count_today}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">LAST ACTIVITY:</span>
                  <span className="stat-value">
                    {doorbellControl.last_activity
                      ? new Date(doorbellControl.last_activity).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : 'No Activity'}
                  </span>
                </div>
                {faceCount !== null && (
                  <div className="stat-item">
                    <span className="stat-label">KNOWN FACES:</span>
                    <span className="stat-value">{faceCount}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
