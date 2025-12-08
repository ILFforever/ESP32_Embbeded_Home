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

      <style jsx>{`
        /* General Card Styles */
        .card {
          background: var(--bg-card);
          backdrop-filter: blur(20px);
          border-radius: var(--radius-lg);
          padding: var(--spacing-lg);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: var(--shadow-md);
          transition: all var(--transition-base);
          display: flex;
          flex-direction: column;
          height: auto;
        }
        .card:hover {
          background: var(--bg-card-hover);
          border-color: rgba(102, 126, 234, 0.6);
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: var(--spacing-md);
          margin-bottom: var(--spacing-lg);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .card-title-group {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
        }
        .card-title-group svg {
          color: var(--primary);
        }
        .card-title-group h3 {
          font-weight: 600;
          color: var(--text-primary);
        }
        .card-content {
          flex: 1;
        }

        /* Compact View */
        .security-compact {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          height: 100%;
          gap: var(--spacing-lg);
        }
        .security-overview {
          display: flex;
          justify-content: space-around;
          width: 100%;
        }
        .overview-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--spacing-sm);
          color: var(--text-secondary);
        }
        .overview-item svg {
          color: var(--primary);
        }
        .overview-item .status-indicator {
          font-size: var(--font-size-xl);
          font-weight: 700;
          color: var(--text-primary);
        }

        /* Expanded View */
        .security-expanded {
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* View Toggle */
        .view-toggle {
          display: flex;
          background-color: var(--bg-secondary);
          border-radius: var(--radius-sm);
          padding: var(--spacing-xs);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .toggle-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          padding: var(--spacing-sm) var(--spacing-md);
          cursor: pointer;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border-radius: 6px;
          transition: all var(--transition-base);
        }
        .toggle-btn.active {
          background: var(--primary);
          color: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .toggle-btn:hover:not(.active) {
          background-color: rgba(255, 255, 255, 0.1);
        }

        /* Waiting Banner - Specific Styling */
        .nfc-waiting-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(254, 202, 87, 0.2);
          border: 2px solid #feca57;
          border-radius: 8px;
          padding: 16px 20px;
          margin-bottom: 24px;
          animation: nfc-pulse 2s ease-in-out infinite;
        }

        .nfc-spinner {
          flex-shrink: 0;
          color: #feca57;
          animation: nfc-spin 2s linear infinite;
        }

        .nfc-waiting-text {
          flex: 1;
          color: #feca57;
          font-size: 14px;
          font-weight: 600;
        }

        .nfc-cancel-btn {
          flex-shrink: 0;
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: #feca57;
          cursor: pointer;
          padding: 6px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .nfc-cancel-btn:hover {
          background: rgba(255, 255, 255, 0.25);
          transform: scale(1.1);
        }

        @keyframes nfc-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes nfc-pulse {
          0%, 100% {
            border-color: #feca57;
            box-shadow: 0 0 15px rgba(254, 202, 87, 0.4);
          }
          50% {
            border-color: #FFD700;
            box-shadow: 0 0 25px rgba(255, 215, 0, 0.6);
          }
        }

        /* Alert Banners */
        .nfc-alert-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--spacing-md);
          border-radius: var(--radius-sm);
          padding: var(--spacing-md) var(--spacing-lg);
          margin-bottom: var(--spacing-lg);
          font-size: var(--font-size-sm);
          font-weight: 600;
          border: 2px solid;
          position: relative;
        }
        .nfc-alert-banner span {
          flex: 1;
        }
        .nfc-alert-banner.error {
          background: rgba(var(--danger-rgb), 0.15);
          border-color: var(--danger);
          color: var(--danger);
        }
        .nfc-alert-banner.success {
          background: rgba(var(--success-rgb), 0.15);
          border-color: var(--success);
          color: var(--success);
        }

        .alert-banner-content {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex: 1;
        }
        .btn-close-banner {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: currentColor;
          cursor: pointer;
          padding: 4px;
          line-height: 1;
          transition: all var(--transition-fast);
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .btn-close-banner:hover {
          background: rgba(255, 255, 255, 0.2);
          border-color: currentColor;
          transform: scale(1.1);
        }
        
        /* Security Section */
        .security-section {
          margin-top: var(--spacing-md);
        }

        /* User & Admin Card Lists */
        .nfc-cards-container {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
          margin: var(--spacing-md) 0;
          padding: var(--spacing-md);
          background: rgba(0, 0, 0, 0.3);
          border-radius: var(--radius-sm);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .nfc-card-row {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-sm) var(--spacing-md);
          background: rgba(255, 255, 255, 0.05);
          border-radius: var(--radius-sm);
          transition: all var(--transition-fast);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .nfc-card-row:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: var(--primary);
        }
        .nfc-card-row svg {
          color: var(--primary);
          flex-shrink: 0;
        }
        .card-id-text {
          flex: 1;
          font-family: 'Courier New', monospace;
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          font-weight: 500;
        }
        .btn-remove-small {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(238, 90, 111, 0.3);
          color: #ff6b7f;
          cursor: pointer;
          transition: all 0.2s ease;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .btn-remove-small:hover:not(:disabled) {
          background: var(--danger);
          border-color: var(--danger);
          color: white;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(238, 90, 111, 0.3);
        }
        .btn-remove-small:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 4px rgba(238, 90, 111, 0.2);
        }
        .btn-remove-small:disabled {
          cursor: not-allowed;
          opacity: 0.4;
          background: rgba(255, 255, 255, 0.02);
          border-color: rgba(255, 255, 255, 0.1);
          color: var(--text-muted);
        }

        /* Action Buttons */
        .btn-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-weight: 600;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all var(--transition-base);
          padding: var(--spacing-sm) var(--spacing-md);
          border: 1px solid transparent;
        }
        .btn-add {
            background: var(--primary);
            color: white;
            border-color: var(--primary);
        }
        .btn-add:hover:not(:disabled) {
            background: var(--primary-dark);
        }
        .btn-delete {
            background: var(--danger);
            color: white;
            border-color: var(--danger);
        }
         .btn-delete:hover:not(:disabled) {
            background: #ee5a6f; /* Slightly darker danger */
        }
        .btn-action:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-add-own-card {
            width: 100%;
            margin-bottom: var(--spacing-lg); /* 1.5rem is approx 24px, so var(--spacing-lg) */
        }

        /* Placeholders */
        .loading-message, .empty-message {
          text-align: center;
          color: var(--text-secondary);
          padding: var(--spacing-xl);
          font-style: italic;
          background: rgba(0,0,0,0.1);
          border-radius: var(--radius-sm);
        }
        
        /* Admin View Grid */
        .devices-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: var(--spacing-lg);
        }
        .security-device-card {
          background: rgba(255, 255, 255, 0.03);
          border-radius: var(--radius-md);
          padding: var(--spacing-lg);
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: all var(--transition-base);
        }
         .security-device-card:hover {
            transform: translateY(-4px);
            border-color: var(--primary);
            box-shadow: var(--shadow-lg);
            background: rgba(255, 255, 255, 0.05);
        }
        .device-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-md);
          padding-bottom: var(--spacing-sm);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .device-icon {
          color: var(--primary);
          flex-shrink: 0;
        }
        .device-info-header h5 {
          margin: 0;
          font-weight: 600;
          color: var(--text-primary);
          font-size: var(--font-size-md);
        }
        .device-info-header .device-location {
          font-size: var(--font-size-xs);
          color: var(--text-secondary);
          margin-top: 2px;
        }
        .admin-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: var(--font-size-sm);
          padding: var(--spacing-sm) 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .admin-info:last-of-type {
            border-bottom: none;
            padding-bottom: 0;
        }
        .info-label {
            color: var(--text-secondary);
            font-weight: 500;
        }
        .info-value {
            font-weight: 600;
            color: var(--text-primary);
        }
        .device-actions {
          margin-top: var(--spacing-lg);
          display: flex;
          gap: var(--spacing-sm);
        }

        .section-header {
          margin-bottom: var(--spacing-md);
          padding-bottom: var(--spacing-sm);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .section-header h4 {
            font-size: var(--font-size-sm);
            font-weight: 700;
            color: var(--text-primary);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin: 0;
        }
      `}</style>
    </div>
  );
}
