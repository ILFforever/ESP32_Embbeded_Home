import React, { useState } from 'react';
import { Camera, Mic, UserCheck, Bell, Volume2, RotateCw, Power, Users } from 'lucide-react';
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
  getFaceCount,
  listFaces,
  checkFaceDatabase,
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

  const handleGetFaceCount = async () => {
    if (!deviceId) return;

    setLoading('face_count');
    try {
      const result = await getFaceCount(deviceId);
      console.log('Face count command queued:', result);
      alert('Face count command queued. Check device serial output.');
    } catch (error) {
      console.error('Error getting face count:', error);
      alert('Failed to get face count');
    } finally {
      setLoading(null);
    }
  };

  const handleListFaces = async () => {
    if (!deviceId) return;

    setLoading('face_list');
    try {
      const result = await listFaces(deviceId);
      console.log('List faces command queued:', result);
      alert('List faces command queued. Check device serial output.');
    } catch (error) {
      console.error('Error listing faces:', error);
      alert('Failed to list faces');
    } finally {
      setLoading(null);
    }
  };

  const handleCheckFaceDB = async () => {
    if (!deviceId) return;

    setLoading('face_check');
    try {
      const result = await checkFaceDatabase(deviceId);
      console.log('Check face DB command queued:', result);
      alert('Face DB check command queued. Check device serial output.');
    } catch (error) {
      console.error('Error checking face database:', error);
      alert('Failed to check face database');
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
                    <span className="status-text">{faceRecognition ? 'ENABLED' : 'DISABLED'}</span>
                    <span className="status-description">
                      {faceRecognition ? 'Identifying visitors' : 'Face recognition off'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    className={`btn-control ${faceRecognition ? 'btn-stop' : 'btn-start'}`}
                    onClick={handleFaceRecognitionToggle}
                  >
                    {faceRecognition ? 'DISABLE' : 'ENABLE'}
                  </button>
                  <button
                    className="btn-control btn-info"
                    onClick={handleGetFaceCount}
                    disabled={loading === 'face_count'}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Users size={16} />
                    {loading === 'face_count' ? 'CHECKING...' : 'FACE COUNT'}
                  </button>
                  <button
                    className="btn-control btn-info"
                    onClick={handleListFaces}
                    disabled={loading === 'face_list'}
                  >
                    {loading === 'face_list' ? 'LISTING...' : 'LIST FACES'}
                  </button>
                  <button
                    className="btn-control btn-info"
                    onClick={handleCheckFaceDB}
                    disabled={loading === 'face_check'}
                  >
                    {loading === 'face_check' ? 'CHECKING...' : 'CHECK DB'}
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
