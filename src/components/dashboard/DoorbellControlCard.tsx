import React, { useState } from 'react';
import { Camera, Mic, UserCheck, Bell } from 'lucide-react';
import type { DoorbellControl } from '@/types/dashboard';
import { controlDoorbell } from '@/services/devices.service';

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

  const handleCameraToggle = async () => {
    if (!deviceId) {
      console.error('No doorbell device ID available');
      return;
    }

    setLoading('camera');
    try {
      const action = cameraActive ? 'camera_stop' : 'camera_start';
      await controlDoorbell(deviceId, action);
      setCameraActive(!cameraActive);
    } catch (error) {
      console.error('Error toggling camera:', error);
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
      const action = micActive ? 'mic_stop' : 'mic_start';
      await controlDoorbell(deviceId, action);
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
              <p>LAST ACTIVITY: {new Date(doorbellControl.last_activity).toLocaleTimeString()}</p>
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
                <button
                  className={`btn-control ${cameraActive ? 'btn-stop' : 'btn-start'}`}
                  onClick={handleCameraToggle}
                  disabled={loading === 'camera'}
                >
                  {loading === 'camera' ? 'PROCESSING...' : cameraActive ? 'STOP CAMERA' : 'START CAMERA'}
                </button>
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
                <button
                  className={`btn-control ${faceRecognition ? 'btn-stop' : 'btn-start'}`}
                  onClick={handleFaceRecognitionToggle}
                >
                  {faceRecognition ? 'DISABLE' : 'ENABLE'}
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
                  <span className="stat-value">{new Date(doorbellControl.last_activity).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
