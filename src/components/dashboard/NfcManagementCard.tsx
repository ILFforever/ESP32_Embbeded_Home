'use client';

import { useState, useEffect } from 'react';
import { CreditCard, User, Shield, AlertCircle, X, Loader, Users, PlusCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  getUsersWithNfc,
  enableAddCardMode,
  disableAddCardMode,
  removeUserNfcCardAdmin,
  initiateUserNfcRegistration,
  cancelUserNfcRegistration,
  removeOwnNfcCard,
  formatCardId,
  UserWithNfc,
} from '@/services/nfc.service';
import { ApiResponse } from '@/services/nfc.service';


interface NfcManagementCardProps {
  isExpanded?: boolean;
}

export function NfcManagementCard({ isExpanded = false }: NfcManagementCardProps) {
  const { user: loggedInUser, refreshUser } = useAuth();
  const [isAdminView, setIsAdminView] = useState(false);

  // Admin view state
  const [users, setUsers] = useState<UserWithNfc[]>([]);
  const [addingCardForUser, setAddingCardForUser] = useState<string | null>(null);

  // User view state
  const [currentUserNfc, setCurrentUserNfc] = useState<UserWithNfc | null>(null);
  const [isAddingOwnCard, setIsAddingOwnCard] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  // Common state
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('db_001');

  // Unified data fetcher
  const fetchData = async (isPolling = false) => {
    if (!isPolling) setLoading(true);

    try {
      const usersData = await getUsersWithNfc();
      if (Array.isArray(usersData)) {
        setUsers(usersData); // For admin view

        if (loggedInUser) {
          const currentUserData = usersData.find(u => u.id === loggedInUser.id) || null;
           // --- User view polling logic ---
          if (isPolling && isAddingOwnCard && currentUserData && currentUserNfc) {
            if (currentUserData.nfc_cards && currentUserData.nfc_cards.length > (currentUserNfc.nfc_cards?.length || 0)) {
              setUserSuccess("Successfully added a new NFC card!");
              setIsAddingOwnCard(false); // This will stop the polling
            }
          }
          setCurrentUserNfc(currentUserData);
        }

        // --- Admin view polling logic ---
        if (isPolling && addingCardForUser) {
          const userBeingAddedTo = usersData.find(u => u.id === addingCardForUser);
          if (userBeingAddedTo && !userBeingAddedTo.is_adding_card) {
            setAddingCardForUser(null);
          }
        }
      } else {
        setUsers([]);
        setCurrentUserNfc(null);
      }
    } catch (err: any) {
      console.error('Error fetching NFC data:', err);
      setUserError('Failed to fetch NFC data.');
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [loggedInUser]);

  // Polling for user view
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isAddingOwnCard && loggedInUser && isExpanded) {
      interval = setInterval(() => fetchData(true), 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAddingOwnCard, loggedInUser, isExpanded]);

  // Polling for admin view
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (addingCardForUser && isExpanded) {
      interval = setInterval(() => fetchData(true), 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [addingCardForUser, isExpanded]);


  // --- User-specific handlers ---
  const handleStartAddOwnCardMode = async () => {
    if (!loggedInUser) return;
    setLoading(true);
    setUserError(null);
    setUserSuccess(null);
    try {
      const result: ApiResponse = await initiateUserNfcRegistration(deviceId);
      if (result.success) {
        setUserSuccess('Add card mode enabled. Please scan your card on the doorbell reader.');
        setIsAddingOwnCard(true);
      } else {
        setUserError(result.message || 'Failed to enable add card mode.');
      }
    } catch (err: any) {
      setUserError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAddOwnCardMode = async () => {
    if (!loggedInUser) return;
    setLoading(true);
    try {
      await cancelUserNfcRegistration(deviceId);
      setUserSuccess('Add card mode cancelled.');
      setIsAddingOwnCard(false);
    } catch (err: any) {
      setUserError(err.message || 'Failed to cancel add card mode.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveOwnCard = async (cardId: string) => {
    if (!loggedInUser || !confirm(`Are you sure you want to remove card ${formatCardId(cardId)}?`)) {
      return;
    }
    setLoading(true);
    setUserError(null);
    setUserSuccess(null);
    try {
      const result: ApiResponse = await removeOwnNfcCard(cardId);
      if (result.success) {
        setUserSuccess('NFC card removed successfully!');
        await fetchData();
        await refreshUser();
      } else {
        setUserError(result.message || 'Failed to remove card.');
      }
    } catch (err: any) {
      setUserError(err.message || 'An error occurred while removing the card.');
    } finally {
      setLoading(false);
    }
  };


  // --- Admin-specific handlers ---
  const handleEnableAddCardModeForUser = async (userId: string) => {
    try {
      await enableAddCardMode(userId, deviceId);
      setAddingCardForUser(userId);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to enable add card mode for user:', err);
    }
  };

  const handleDisableAddCardModeForUser = async (userId: string) => {
    try {
      await disableAddCardMode(userId, deviceId);
      setAddingCardForUser(null);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to disable add card mode for user:', err);
    }
  };

  const handleRemoveCardFromUser = async (userId: string, cardId: string, userName: string) => {
    if (!confirm(`Remove NFC card ${formatCardId(cardId)} from ${userName}?`)) {
      return;
    }
    try {
      await removeUserNfcCardAdmin(cardId, userId);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to remove NFC card');
    }
  };

  const totalCards = users.reduce((sum, user) => sum + (user.nfc_cards?.length || 0), 0);
  const ownCardCount = currentUserNfc?.nfc_cards?.length || 0;
  
  const renderUserView = () => (
    <>
      {userError && (
        <div className="nfc-alert-banner error">
          <AlertCircle size={20} />
          <span>{userError}</span>
        </div>
      )}
      {userSuccess && !isAddingOwnCard && (
        <div className="nfc-alert-banner success">
          <span>{userSuccess}</span>
          <button className="btn-close-banner" onClick={() => setUserSuccess(null)}>
            <X size={18} />
          </button>
        </div>
      )}
  
      {isAddingOwnCard ? (
         <div className="nfc-waiting-banner">
           <Loader className="nfc-spinner" size={20} />
           <span className="nfc-waiting-text">WAITING FOR SCAN... Please scan your card on the reader.</span>
           <button className="nfc-cancel-btn" onClick={handleCancelAddOwnCardMode}>
             <X size={18} />
           </button>
         </div>
      ) : (
        <button
          className="btn-action btn-add btn-add-own-card"
          onClick={handleStartAddOwnCardMode}
          disabled={loading}
        >
          <PlusCircle size={16} />
          {loading ? 'Processing...' : 'Add My New Card'}
        </button>
      )}
  
      <div className="security-section">
        <div className="section-header">
          <h4>Your Registered Cards ({ownCardCount})</h4>
        </div>
  
        {(loading && !currentUserNfc) && <div className="loading-message">Loading your cards...</div>}
  
        {currentUserNfc?.nfc_cards && currentUserNfc.nfc_cards.length > 0 ? (
          <div className="nfc-cards-container">
            {currentUserNfc.nfc_cards.map((cardId) => (
              <div key={cardId} className="nfc-card-row">
                <CreditCard size={14} />
                <span className="card-id-text">{formatCardId(cardId)}</span>
                <button
                  className="btn-remove-small"
                  onClick={() => handleRemoveOwnCard(cardId)}
                  title="Remove card"
                  disabled={loading || isAddingOwnCard}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          !loading && <div className="empty-message">You have no registered NFC cards.</div>
        )}
      </div>
    </>
  );

  const renderAdminView = () => (
    <>
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
              onClick={() => handleDisableAddCardModeForUser(addingCardForUser)}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

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

              {user.nfc_cards && user.nfc_cards.length > 0 && (
                <div className="nfc-cards-container">
                  {user.nfc_cards.map((cardId, index) => (
                    <div key={index} className="nfc-card-row">
                      <CreditCard size={14} />
                      <span className="card-id-text">{formatCardId(cardId)}</span>
                      <button
                        className="btn-remove-small"
                        onClick={() => handleRemoveCardFromUser(user.id, cardId, user.name)}
                        title="Remove card"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="device-actions">
                {user.is_adding_card || addingCardForUser === user.id ? (
                  <button
                    className="btn-action btn-delete"
                    onClick={() => handleDisableAddCardModeForUser(user.id)}
                  >
                    <X size={16} />
                    CANCEL
                  </button>
                ) : (
                  <button
                    className="btn-action btn-add"
                    onClick={() => handleEnableAddCardModeForUser(user.id)}
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
    </>
  );

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          <CreditCard size={20} />
          <h3>NFC Card Management</h3>
        </div>
        {isExpanded && loggedInUser?.role === 'admin' && (
          <div className="view-toggle">
            <button
              className={`toggle-btn ${!isAdminView ? 'active' : ''}`}
              onClick={() => setIsAdminView(false)}
            >
              <User size={16} />
              My Cards
            </button>
            <button
              className={`toggle-btn ${isAdminView ? 'active' : ''}`}
              onClick={() => setIsAdminView(true)}
            >
              <Shield size={16} />
              Admin View
            </button>
          </div>
        )}
      </div>

      <div className="card-content">
        {!isExpanded ? (
          /* Compact view */
          <div className="security-compact">
            <div className="security-overview">
               <div className="overview-item">
                <CreditCard size={20} />
                <span>MY CARDS</span>
                <span className="status-indicator">
                  {ownCardCount}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="security-expanded">
            {loading && <div className="loading-message">Loading...</div>}
            {isAdminView ? renderAdminView() : renderUserView()}
          </div>
        )}
      </div>
    </div>
  );
}
