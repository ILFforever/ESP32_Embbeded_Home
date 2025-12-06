import React, { useState } from 'react';
import { DoorOpen, DoorClosed, Lock, Unlock, RefreshCw, X } from 'lucide-react';
import type { DoorWindow } from '@/types/dashboard';
import { sendCommand, getLockStatus, type DoorLockStatus } from '@/services/devices.service';

interface DoorCardProps {
  doorsWindows: DoorWindow[];
  isExpanded?: boolean;
}

export function DoorCard({ doorsWindows, isExpanded = false }: DoorCardProps) {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [lockStatus, setLockStatus] = useState<DoorLockStatus | null>(null);
  const [fetchingStatus, setFetchingStatus] = useState(false);

  const getStatusIcon = (item: DoorWindow) => {
    if (item.type === 'door') {
      return item.status === 'locked' ? (
        <Lock className="status-icon status-locked" size={24} />
      ) : item.status === 'unlocked' ? (
        <Unlock className="status-icon status-unlocked" size={24} />
      ) : (
        <DoorOpen className="status-icon status-open" size={24} />
      );
    }
    return null;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'locked':
      case 'closed':
        return '#00FF88';
      case 'unlocked':
        return '#FFAA00';
      case 'open':
        return '#FF6600';
      default:
        return '#FFF';
    }
  };

  const getOnlineStatusBadge = (online: boolean | undefined) => {
    const isOnline = online ?? false;
    return (
      <span className={`status-indicator ${isOnline ? 'status-online' : 'status-offline'}`}>
        {isOnline ? 'ONLINE' : 'OFFLINE'}
      </span>
    );
  };

  const handleLockAction = async (doorId: string, action: 'lock' | 'unlock') => {
    try {
      setLoadingStates(prev => ({ ...prev, [doorId]: true }));

      // Send command with timeout parameter
      const result = await sendCommand(doorId, action, { timeout: 5000 });

      if (result && result.status === 'ok') {
        console.log(`${action} command sent successfully:`, result);

        // Poll for state change with 10 second timeout
        const expectedState = action === 'lock' ? 'locked' : 'unlocked';
        const startTime = Date.now();
        const maxWaitTime = 20000; // 20 seconds
        const pollInterval = 1000; // Check every 1000ms

        const checkStatus = async (): Promise<boolean> => {
          try {
            const status = await getLockStatus(doorId);
            if (status && status.lock_state === expectedState) {
              return true;
            }

            // Check if timeout exceeded
            if (Date.now() - startTime > maxWaitTime) {
              console.log(`Timeout waiting for ${action} state change`);
              return false;
            }

            // Continue polling
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            return checkStatus();
          } catch (error) {
            console.error('Error checking lock status:', error);
            return false;
          }
        };

        await checkStatus();
      } else {
        alert(`Failed to ${action} door. Please try again.`);
      }
    } catch (error) {
      console.error(`Error sending ${action} command:`, error);
      alert(`Failed to ${action} door. Please try again.`);
    } finally {
      setLoadingStates(prev => ({ ...prev, [doorId]: false }));
    }
  };

  const fetchLockStatus = async (doorId: string) => {
    try {
      setFetchingStatus(true);
      const status = await getLockStatus(doorId);
      setLockStatus(status);
    } catch (error) {
      console.error('Error fetching lock status:', error);
      alert('Failed to fetch lock status');
    } finally {
      setFetchingStatus(false);
    }
  };

  const openStatusModal = async (doorId: string) => {
    setSelectedDoorId(doorId);
    setShowStatusModal(true);
    await fetchLockStatus(doorId);
  };

  const closeStatusModal = () => {
    setShowStatusModal(false);
    setSelectedDoorId(null);
    setLockStatus(null);
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch (error) {
      return 'N/A';
    }
  };

  // Filter out windows - only show doors
  const doors = doorsWindows.filter(item => item.type === 'door');

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div className="card-title-group">
            <DoorClosed size={20} />
            <h3>DOORS</h3>
          </div>
        </div>

        <div className="card-content">
          {!isExpanded ? (
            /* Compact view */
            <div className="doors-windows-compact">
              {doors.map(item => (
                <div
                  key={item.id}
                  className="door-window-item-compact"
                  onClick={() => openStatusModal(item.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {getStatusIcon(item)}
                  <div className="item-info">
                    <span className="item-name">{item.name}</span>
                    <span
                      className="item-status"
                      style={{ color: getStatusColor(item.status) }}
                    >
                      {item.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Expanded view */
            <div className="doors-windows-expanded">
              <div className="section">
                <h4>DOORS ({doors.length})</h4>
                <div className="items-grid">
                  {doors.map(door => (
                    <div key={door.id} className="door-window-card">
                      <div
                        className="card-icon-header"
                        onClick={() => openStatusModal(door.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        {getStatusIcon(door)}
                        {getOnlineStatusBadge(door.online)}
                      </div>
                      <h5>{door.name}</h5>
                      <div className="status-badge" style={{ borderColor: getStatusColor(door.status) }}>
                        <span style={{ color: getStatusColor(door.status) }}>
                          {door.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="item-details">
                        <p>
                          <span className="detail-label">LOCATION:</span> {door.location}
                        </p>
                        <p>
                          <span className="detail-label">LAST CHANGED:</span>{' '}
                          {new Date(door.last_changed).toLocaleString()}
                        </p>
                        <p>
                          <span className="detail-label">ID:</span> {door.id}
                        </p>
                      </div>
                      <div className="item-actions">
                        {door.status === 'locked' ? (
                          <button
                            className="btn-action btn-unlock"
                            onClick={() => handleLockAction(door.id, 'unlock')}
                            disabled={loadingStates[door.id] || !door.online}
                            style={{
                              backgroundColor: !door.online ? 'var(--bg-secondary)' : undefined,
                              color: !door.online ? '#000000' : undefined,
                              cursor: !door.online ? 'not-allowed' : undefined,
                              opacity: !door.online ? 0.6 : undefined,
                              fontSize: !door.online ? '18px' : undefined,
                              fontWeight: !door.online ? '700' : undefined
                            }}
                          >
                            {loadingStates[door.id] ? 'UNLOCKING...' : !door.online ? 'OFFLINE' : 'UNLOCK'}
                          </button>
                        ) : (
                          <button
                            className="btn-action btn-lock"
                            onClick={() => handleLockAction(door.id, 'lock')}
                            disabled={loadingStates[door.id] || !door.online}
                            style={{
                              backgroundColor: !door.online ? 'var(--bg-secondary)' : undefined,
                              color: !door.online ? '#000000' : undefined,
                              cursor: !door.online ? 'not-allowed' : undefined,
                              opacity: !door.online ? 0.6 : undefined,
                              fontSize: !door.online ? '18px' : undefined,
                              fontWeight: !door.online ? '700' : undefined
                            }}
                          >
                            {loadingStates[door.id] ? 'LOCKING...' : !door.online ? 'OFFLINE' : 'LOCK'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Modal */}
      {showStatusModal && selectedDoorId && (
        <div className="modal-overlay" onClick={closeStatusModal}>
          <button className="modal-close" onClick={closeStatusModal}>
            <X size={24} />
          </button>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="card">
              <div className="card-header">
                <div className="card-title-group">
                  <Lock size={24} />
                  <h3>DOOR LOCK STATUS</h3>
                </div>
                <button
                  onClick={() => fetchLockStatus(selectedDoorId)}
                  disabled={fetchingStatus}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '600',
                    backgroundColor: '#5B7FFF',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: fetchingStatus ? 'not-allowed' : 'pointer',
                    opacity: fetchingStatus ? 0.6 : 1,
                    transition: 'all 0.2s ease',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}
                  onMouseEnter={(e) => {
                    if (!fetchingStatus) {
                      e.currentTarget.style.backgroundColor = '#4A6EEE';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#5B7FFF';
                  }}
                >
                  <RefreshCw size={16} className={fetchingStatus ? 'rotating' : ''} />
                  {fetchingStatus ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              <div className="card-content">
                {fetchingStatus && !lockStatus ? (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <RefreshCw size={48} className="rotating" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                    <p>Loading status...</p>
                  </div>
                ) : lockStatus ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Row 1: Device ID, Device Name, Online, Lock State, Last Action, Last Action Time */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Device ID:
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '500' }}>
                          {lockStatus.device_id}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Device Name:
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '500' }}>
                          {lockStatus.device_name}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Online:
                        </div>
                        <div>
                          <span className={`status-indicator ${lockStatus.online ? 'status-online' : 'status-offline'}`}>
                            {lockStatus.online ? 'YES' : 'NO'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Lock State:
                        </div>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: 'bold',
                          color: lockStatus.lock_state === 'locked' ? '#00FF88' : '#FFAA00'
                        }}>
                          {lockStatus.lock_state.toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Last Action:
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '500' }}>
                          {lockStatus.last_action.toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Last Action Time:
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '500' }}>
                          {formatTimestamp(lockStatus.last_action_time)}
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Last Heartbeat, WiFi Signal, Uptime */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Last Heartbeat:
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '500' }}>
                          {formatTimestamp(lockStatus.last_heartbeat)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                          WiFi Signal:
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '500' }}>
                          {lockStatus.wifi_rssi !== null ? `${lockStatus.wifi_rssi} dBm` : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Uptime:
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '500' }}>
                          {lockStatus.uptime_ms !== null
                            ? `${Math.floor(lockStatus.uptime_ms / 3600000)}h ${Math.floor((lockStatus.uptime_ms % 3600000) / 60000)}m`
                            : 'N/A'}
                        </div>
                      </div>
                    </div>

                    {/* Row 3: Pending Commands - Full Width */}
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                        Pending Commands:
                      </div>
                      <div>
                        <span className={`status-indicator ${lockStatus.has_pending_commands ? 'status-warning' : 'status-online'}`}>
                          {lockStatus.has_pending_commands ? `YES (${lockStatus.pending_commands.length})` : 'NO'}
                        </span>
                      </div>
                      {lockStatus.has_pending_commands && lockStatus.pending_commands.length > 0 && (
                        <div style={{
                          marginTop: '12px',
                          padding: '12px',
                          background: 'rgba(255, 170, 0, 0.1)',
                          border: '1px solid rgba(255, 170, 0, 0.3)',
                          borderRadius: '4px'
                        }}>
                          <p style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--warning)' }}>
                            Pending Commands:
                          </p>
                          {lockStatus.pending_commands.map((cmd: any, idx: number) => (
                            <div key={idx} style={{ fontSize: '13px', marginLeft: '12px', marginBottom: '4px' }}>
                              • {cmd.action || 'Unknown action'}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    <p>Failed to load lock status</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
