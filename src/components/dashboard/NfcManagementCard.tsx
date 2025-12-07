'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Trash2, User, Shield, AlertCircle, X } from 'lucide-react';
import {
  getUsersWithNfc,
  enableAddCardMode,
  disableAddCardMode,
  removeNfcCard,
  formatCardId,
  UserWithNfc
} from '@/services/nfc.service';

interface NfcManagementCardProps {
  isExpanded?: boolean;
}

export function NfcManagementCard({ isExpanded = false }: NfcManagementCardProps) {
  const [users, setUsers] = useState<UserWithNfc[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingCardForUser, setAddingCardForUser] = useState<string | null>(null);

  // Fetch data on component mount and when expanded
  useEffect(() => {
    if (isExpanded) {
      fetchData();
    }
  }, [isExpanded]);

  // Auto-refresh when in add card mode
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (addingCardForUser && isExpanded) {
      interval = setInterval(() => {
        fetchData();
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [addingCardForUser, isExpanded]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const usersData = await getUsersWithNfc();

      if (Array.isArray(usersData)) {
        setUsers(usersData);

        // Check if user finished adding card
        if (addingCardForUser) {
          const user = usersData.find(u => u.id === addingCardForUser);
          if (user && !user.is_adding_card) {
            setAddingCardForUser(null);
          }
        }
      } else {
        setUsers([]);
      }
    } catch (err: any) {
      console.error('Error fetching NFC data:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableAddCardMode = async (userId: string) => {
    try {
      await enableAddCardMode(userId);
      setAddingCardForUser(userId);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to enable add card mode:', err);
    }
  };

  const handleDisableAddCardMode = async (userId: string) => {
    try {
      await disableAddCardMode(userId);
      setAddingCardForUser(null);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to disable add card mode:', err);
    }
  };

  const handleRemoveCard = async (userId: string, cardId: string, userName: string) => {
    if (!confirm(`Remove NFC card ${formatCardId(cardId)} from ${userName}?`)) {
      return;
    }

    try {
      await removeNfcCard(userId, cardId);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to remove NFC card');
    }
  };

  const totalCards = users.reduce((sum, user) => sum + (user.nfc_cards?.length || 0), 0);

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          <CreditCard size={20} />
          <h3>NFC CARD MANAGEMENT</h3>
        </div>
      </div>

      <div className="card-content">
        {!isExpanded ? (
          /* Compact view */
          <div className="security-compact">
            <div className="security-overview">
              <div className="overview-item">
                <CreditCard size={20} />
                <span>TOTAL NFC CARDS</span>
                <span className="status-indicator">
                  {totalCards}
                </span>
              </div>
              {addingCardForUser && (
                <div className="overview-item">
                  <AlertCircle size={20} />
                  <span>ADD MODE ACTIVE</span>
                  <span className="status-indicator" style={{ background: 'linear-gradient(135deg, #FFA500, #FF8C00)' }}>
                    WAITING
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Expanded view */
          <div className="security-expanded">
            {loading && <div className="loading-message">Loading...</div>}

            {/* Add Card Mode Alert */}
            {addingCardForUser && (
              <div className="nfc-alert-banner">
                <div className="alert-banner-content">
                  <AlertCircle size={20} />
                  <span>
                    WAITING FOR NFC SCAN -
                    <strong> {users.find(u => u.id === addingCardForUser)?.name}</strong>
                  </span>
                  <button
                    className="btn-close-banner"
                    onClick={() => handleDisableAddCardMode(addingCardForUser)}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Users Section */}
            <div className="security-section">
              <div className="section-header">
                <h4>NFC CARDS BY USER ({users.length})</h4>
              </div>

              <div className="devices-grid">
                {users.length === 0 && !loading && (
                  <div className="empty-message">No users found</div>
                )}
                {users.map(user => (
                  <div key={user.id} className="security-device-card">
                    <div className="device-header">
                      {user.role === 'admin' ? (
                        <Shield className="device-icon" size={24} />
                      ) : (
                        <User className="device-icon" size={24} />
                      )}
                      <div className="device-info-header">
                        <h5>{user.name}</h5>
                        <span className="device-location">{user.email}</span>
                      </div>
                    </div>

                    <div className="admin-info">
                      <span className="info-label">Role:</span>
                      <span className="info-value">{user.role.toUpperCase()}</span>
                    </div>
                    <div className="admin-info">
                      <span className="info-label">Phone:</span>
                      <span className="info-value">{user.telephone_number}</span>
                    </div>
                    <div className="admin-info">
                      <span className="info-label">NFC Cards:</span>
                      <span className="info-value">
                        {user.nfc_cards?.length || 0} {(user.nfc_cards?.length || 0) === 1 ? 'card' : 'cards'}
                      </span>
                    </div>

                    {/* NFC Cards List */}
                    {user.nfc_cards && user.nfc_cards.length > 0 && (
                      <div className="nfc-cards-container">
                        {user.nfc_cards.map((cardId, index) => (
                          <div key={index} className="nfc-card-row">
                            <CreditCard size={14} />
                            <span className="card-id-text">{formatCardId(cardId)}</span>
                            <button
                              className="btn-remove-small"
                              onClick={() => handleRemoveCard(user.id, cardId, user.name)}
                              title="Remove card"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="device-actions">
                      {user.is_adding_card || addingCardForUser === user.id ? (
                        <button
                          className="btn-action btn-delete"
                          onClick={() => handleDisableAddCardMode(user.id)}
                        >
                          <X size={16} />
                          CANCEL
                        </button>
                      ) : (
                        <button
                          className="btn-action btn-add"
                          onClick={() => handleEnableAddCardMode(user.id)}
                          disabled={!!addingCardForUser}
                        >
                          <CreditCard size={16} />
                          ADD CARD
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

      <style jsx>{`
        .nfc-alert-banner {
          background: rgba(255, 165, 0, 0.15);
          border: 1px solid #FFA500;
          border-radius: 4px;
          padding: 0.75rem 1rem;
          margin-bottom: 1.5rem;
          animation: pulse-border 2s ease-in-out infinite;
        }

        @keyframes pulse-border {
          0%, 100% {
            border-color: #FFA500;
            box-shadow: 0 0 0 rgba(255, 165, 0, 0);
          }
          50% {
            border-color: #FF8C00;
            box-shadow: 0 0 12px rgba(255, 165, 0, 0.4);
          }
        }

        .alert-banner-content {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: #FFA500;
          font-size: 0.9rem;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .alert-banner-content svg {
          flex-shrink: 0;
        }

        .alert-banner-content strong {
          color: var(--primary-color);
          font-weight: 700;
        }

        .btn-close-banner {
          margin-left: auto;
          background: none;
          border: none;
          color: #FF6600;
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          align-items: center;
          transition: all 0.2s;
        }

        .btn-close-banner:hover {
          color: #FF0000;
          transform: scale(1.1);
        }

        .nfc-cards-container {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          margin: 0.75rem 0;
          padding: 0.75rem;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
          border: 1px solid rgba(var(--primary-color-rgb), 0.2);
        }

        .nfc-card-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.5rem;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 3px;
          transition: all 0.2s;
        }

        .nfc-card-row:hover {
          background: rgba(0, 0, 0, 0.5);
        }

        .nfc-card-row svg:first-child {
          color: var(--primary-color);
          flex-shrink: 0;
        }

        .card-id-text {
          flex: 1;
          color: var(--primary-color);
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 0.3px;
        }

        .btn-remove-small {
          background: none;
          border: none;
          color: #FF6600;
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          align-items: center;
          transition: all 0.2s;
          opacity: 0.7;
        }

        .btn-remove-small:hover {
          color: #FF0000;
          opacity: 1;
          transform: scale(1.15);
        }

        .btn-add {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
        }

        .btn-add:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(var(--primary-color-rgb), 0.4);
        }

        .btn-add:disabled {
          opacity: 0.3;
          cursor: not-allowed;
          transform: none;
        }

        .btn-add:disabled:hover {
          transform: none;
          box-shadow: none;
        }

        .loading-message,
        .error-message,
        .empty-message {
          padding: 1rem;
          text-align: center;
          color: rgba(255, 255, 255, 0.5);
          font-style: italic;
        }

        .error-message {
          color: #FF6600;
          background: rgba(255, 102, 0, 0.1);
          border: 1px solid #FF6600;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
