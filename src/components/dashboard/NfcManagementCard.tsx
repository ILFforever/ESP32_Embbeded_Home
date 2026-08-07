'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CreditCard, PlusCircle, Shield, User, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ModalPortal } from '@/components/glass/ModalPortal';
import { useModalTransition } from '@/components/glass/useModalTransition';
import { ContentSkeleton } from '@/components/glass/Skeleton';
import {
  getUsersWithNfc,
  enableAddCardMode,
  disableAddCardMode,
  removeUserNfcCardAdmin,
  initiateUserNfcRegistration,
  cancelUserNfcRegistration,
  removeOwnNfcCard,
  formatCardId,
  type UserWithNfc,
  type ApiResponse,
} from '@/services/nfc.service';

interface NfcManagementCardProps {
  isExpanded?: boolean;
  /* Set by the dashboard modal, which names the card itself. /access keeps
     the header — there the card is one section among several. */
  hideHeader?: boolean;
  /** Use the flatter composition on the dedicated Access page. */
  pageLayout?: boolean;
}

type PendingRemoval = {
  scope: 'own' | 'admin';
  cardId: string;
  userId?: string;
  userName: string;
};

function userCardCount(user: UserWithNfc | null) {
  return user?.nfc_cards?.length || 0;
}

function roleChip(role: UserWithNfc['role']) {
  return role === 'admin' ? 'g-chip g-chip--ok' : 'g-chip';
}

function StatusMessage({
  kind,
  children,
  onDismiss,
}: {
  kind: 'error' | 'success' | 'wait';
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const className = kind === 'error' ? 'g-error' : `g-tile ${kind === 'wait' ? 'is-warn' : ''}`;

  return (
    <div className={className}>
      {kind === 'error' ? <AlertCircle size={18} /> : null}
      <div className="g-row g-row--between g-row--wrap" style={{ width: '100%' }}>
        <span>{children}</span>
        {onDismiss && (
          <button className="g-icon-btn" onClick={onDismiss} aria-label="Dismiss message">
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

export function NfcManagementCard({ isExpanded = false, hideHeader = false, pageLayout = false }: NfcManagementCardProps) {
  const { user: loggedInUser, refreshUser } = useAuth();
  const [isAdminView, setIsAdminView] = useState(false);

  const [users, setUsers] = useState<UserWithNfc[]>([]);
  const [addingCardForUser, setAddingCardForUser] = useState<string | null>(null);

  const [currentUserNfc, setCurrentUserNfc] = useState<UserWithNfc | null>(null);
  const [isAddingOwnCard, setIsAddingOwnCard] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('db_001');
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  // Latched so the card keeps its text through the closing animation.
  const removalModal = useModalTransition(pendingRemoval);
  const shownRemoval = removalModal.value;

  const fetchData = async (isPolling = false) => {
    if (!isPolling) setLoading(true);

    try {
      const usersData = await getUsersWithNfc();
      if (Array.isArray(usersData)) {
        setUsers(usersData);

        if (loggedInUser) {
          const currentUserData = usersData.find((user) => user.id === loggedInUser.id) || null;

          if (isPolling && isAddingOwnCard && currentUserData && currentUserNfc) {
            if ((currentUserData.nfc_cards?.length || 0) > (currentUserNfc.nfc_cards?.length || 0)) {
              setUserSuccess('Successfully added a new NFC card.');
              setIsAddingOwnCard(false);
            }
          }

          setCurrentUserNfc(currentUserData);
        }

        if (isPolling && addingCardForUser) {
          const userBeingAddedTo = usersData.find((user) => user.id === addingCardForUser);
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
      setUserError('NFC data could not be loaded. Check your connection and try again.');
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [loggedInUser]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isAddingOwnCard && loggedInUser && isExpanded) {
      interval = setInterval(() => fetchData(true), 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAddingOwnCard, loggedInUser, isExpanded]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (addingCardForUser && isExpanded) {
      interval = setInterval(() => fetchData(true), 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [addingCardForUser, isExpanded]);

  useEffect(() => {
    if (!pendingRemoval) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingRemoval(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pendingRemoval]);

  const handleStartAddOwnCardMode = async () => {
    if (!loggedInUser) return;
    setLoading(true);
    setUserError(null);
    setUserSuccess(null);
    try {
      const result: ApiResponse = await initiateUserNfcRegistration(deviceId);
      if (result.success) {
        setUserSuccess('Add-card mode is on. Scan your card on the doorbell reader.');
        setIsAddingOwnCard(true);
      } else {
        setUserError(result.message || 'Add-card mode could not be enabled.');
      }
    } catch (err: any) {
      setUserError(err.message || 'Add-card mode could not be enabled.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAddOwnCardMode = async () => {
    if (!loggedInUser) return;
    setLoading(true);
    try {
      await cancelUserNfcRegistration(deviceId);
      setUserSuccess('Add-card mode was cancelled.');
      setIsAddingOwnCard(false);
    } catch (err: any) {
      setUserError(err.message || 'Add-card mode could not be cancelled.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnableAddCardModeForUser = async (userId: string) => {
    try {
      setUserError(null);
      await enableAddCardMode(userId, deviceId);
      setAddingCardForUser(userId);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to enable add-card mode for user:', err);
      setUserError(err.message || 'Add-card mode could not be enabled for this user.');
    }
  };

  const handleDisableAddCardModeForUser = async (userId: string) => {
    try {
      await disableAddCardMode(userId, deviceId);
      setAddingCardForUser(null);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to disable add-card mode for user:', err);
      setUserError(err.message || 'Add-card mode could not be cancelled for this user.');
    }
  };

  const confirmRemoveOwnCard = (cardId: string) => {
    setPendingRemoval({
      scope: 'own',
      cardId,
      userName: currentUserNfc?.name || loggedInUser?.name || 'your account',
    });
  };

  const confirmRemoveCardFromUser = (userId: string, cardId: string, userName: string) => {
    setPendingRemoval({ scope: 'admin', userId, cardId, userName });
  };

  const handleConfirmRemoval = async () => {
    if (!pendingRemoval) return;
    setLoading(true);
    setUserError(null);
    setUserSuccess(null);

    try {
      if (pendingRemoval.scope === 'own') {
        const result: ApiResponse = await removeOwnNfcCard(pendingRemoval.cardId);
        if (result.success) {
          setUserSuccess('NFC card removed.');
          await fetchData();
          await refreshUser();
        } else {
          setUserError(result.message || 'The card could not be removed.');
        }
      } else if (pendingRemoval.userId) {
        await removeUserNfcCardAdmin(pendingRemoval.cardId, pendingRemoval.userId);
        setUserSuccess(`${pendingRemoval.userName}'s card was revoked.`);
        await fetchData();
      }
    } catch (err: any) {
      setUserError(err.message || 'The card could not be removed.');
    } finally {
      setLoading(false);
      setPendingRemoval(null);
    }
  };

  const totalCards = users.reduce((sum, user) => sum + userCardCount(user), 0);
  const ownCardCount = userCardCount(currentUserNfc);
  const addingUser = addingCardForUser ? users.find((user) => user.id === addingCardForUser) : null;

  const renderDevicePicker = () => (
    <div className="g-field" style={{ minWidth: '220px' }}>
      <label htmlFor="nfc-device">Reader</label>
      <select id="nfc-device" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} disabled={loading || isAddingOwnCard || !!addingCardForUser}>
        <option value="db_001">Doorbell reader · db_001</option>
        <option value="dl_back">Back door reader · dl_back</option>
      </select>
    </div>
  );

  const renderUserView = () => (
    <div className="g-stack">
      {userError && <StatusMessage kind="error">{userError}</StatusMessage>}
      {userSuccess && !isAddingOwnCard && <StatusMessage kind="success" onDismiss={() => setUserSuccess(null)}>{userSuccess}</StatusMessage>}

      <div className={`g-row g-row--between g-row--wrap ${pageLayout ? 'access-nfc-toolbar' : ''}`}>
        {renderDevicePicker()}
        {isAddingOwnCard ? (
          <button className="g-btn g-btn--ghost" onClick={handleCancelAddOwnCardMode} disabled={loading}>
            <X size={16} /> Cancel enrolment
          </button>
        ) : (
          <button className="g-btn g-btn--primary" onClick={handleStartAddOwnCardMode} disabled={loading}>
            <PlusCircle size={16} /> {loading ? 'Processing...' : 'Add my card'}
          </button>
        )}
      </div>

      {isAddingOwnCard && (
        <StatusMessage kind="wait">
          <span className="g-row"><CreditCard size={17} /> Waiting for a card scan on {deviceId}.</span>
        </StatusMessage>
      )}

      <section className={pageLayout ? 'access-nfc-cards' : 'g-tile'}>
        <div className="g-row g-row--between">
          <h3>Your cards</h3>
          <span className="g-chip">{ownCardCount} {ownCardCount === 1 ? 'card' : 'cards'}</span>
        </div>

        {loading && !currentUserNfc ? (
          <ContentSkeleton label="Loading registered NFC cards." rows={2} />
        ) : currentUserNfc?.nfc_cards && currentUserNfc.nfc_cards.length > 0 ? (
          <div className="g-list">
            {currentUserNfc.nfc_cards.map((cardId) => (
              <div className="g-list__row" key={cardId}>
                <i className="g-dot g-dot--ok" />
                <p>
                  Card active
                  <span className="g-mono">{formatCardId(cardId)}</span>
                </p>
                <button className="g-btn g-btn--ghost" onClick={() => confirmRemoveOwnCard(cardId)} disabled={loading || isAddingOwnCard}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="g-empty">
            <strong>No registered cards</strong>
            <p>Add a card to unlock doors from the reader.</p>
          </div>
        )}
      </section>
    </div>
  );

  const renderAdminView = () => (
    <div className="g-stack">
      {userError && <StatusMessage kind="error">{userError}</StatusMessage>}
      {userSuccess && <StatusMessage kind="success" onDismiss={() => setUserSuccess(null)}>{userSuccess}</StatusMessage>}

      <div className={`g-row g-row--between g-row--wrap ${pageLayout ? 'access-nfc-toolbar' : ''}`}>
        {renderDevicePicker()}
        {addingUser && (
          <StatusMessage kind="wait">
            <span className="g-row"><CreditCard size={17} /> Waiting for {addingUser.name} to scan a card.</span>
          </StatusMessage>
        )}
      </div>

      <div className="g-scroll">
        <table className="g-table" aria-label="NFC cards by user">
          <thead>
            <tr>
              <th>Holder</th>
              <th>Role</th>
              <th>Phone</th>
              <th>Card ID</th>
              <th>Status</th>
              <th className="g-num-cell">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && !loading ? (
              <tr>
                <td colSpan={6}>
                  <div className="g-empty"><strong>No users found</strong><p>NFC holders will appear after users load.</p></div>
                </td>
              </tr>
            ) : users.flatMap((user) => {
              const cards = user.nfc_cards?.length ? user.nfc_cards : [null];
              return cards.map((cardId, index) => (
                <tr key={`${user.id}-${cardId || 'empty'}-${index}`}>
                  <td>
                    <div className="g-row">
                      {user.role === 'admin' ? <Shield size={16} /> : <User size={16} />}
                      <div>
                        <strong style={{ display: 'block', fontWeight: 600 }}>{user.name}</strong>
                        <span className="g-dim" style={{ fontSize: '12px' }}>{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className={roleChip(user.role)}>{user.role}</span></td>
                  <td className="g-mono">{user.telephone_number || '-'}</td>
                  <td className="g-mono">{cardId ? formatCardId(cardId) : '-'}</td>
                  <td>
                    {cardId ? <span className="g-chip g-chip--ok">Active</span> : <span className="g-chip">No card</span>}
                  </td>
                  <td className="g-num-cell">
                    <div className="g-row" style={{ justifyContent: 'flex-end' }}>
                      {cardId && (
                        <button className="g-btn g-btn--ghost" onClick={() => confirmRemoveCardFromUser(user.id, cardId, user.name)}>
                          Revoke
                        </button>
                      )}
                      {user.is_adding_card || addingCardForUser === user.id ? (
                        <button className="g-btn g-btn--danger" onClick={() => handleDisableAddCardModeForUser(user.id)}>
                          <X size={16} /> Cancel
                        </button>
                      ) : (
                        <button className="g-btn g-btn--ghost" onClick={() => handleEnableAddCardModeForUser(user.id)} disabled={!!addingCardForUser}>
                          <CreditCard size={16} /> Add
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const viewSwitch = (
    <div className="g-seg" data-choice aria-label="NFC management view">
      <button aria-current={!isAdminView ? 'true' : undefined} onClick={() => setIsAdminView(false)}>
        <User size={15} /> My cards
      </button>
      <button aria-current={isAdminView ? 'true' : undefined} onClick={() => setIsAdminView(true)}>
        <Shield size={15} /> Admin
      </button>
    </div>
  );

  return (
    <>
      {hideHeader ? (
        /* The modal head already says "NFC cards" and why they matter, and
           the tiles below already count them. Only the view switch has
           nowhere else to live. */
        isExpanded && loggedInUser?.role === 'admin' && (
          <div className="g-row">{viewSwitch}</div>
        )
      ) : (
        <header className={pageLayout ? 'access-section-head' : undefined}>
          <div>
            <h2>NFC cards</h2>
            {isExpanded && <p className="g-sub">Cards are checked at the reader before a lock command is sent.</p>}
          </div>
          {isExpanded && loggedInUser?.role === 'admin' ? (
            viewSwitch
          ) : (
            <span className="g-label">{isExpanded ? `${totalCards} total` : `${ownCardCount} mine`}</span>
          )}
        </header>
      )}

      {!isExpanded ? (
        <div className="g-list">
          <div className="g-list__row">
            <i className={ownCardCount ? 'g-dot g-dot--ok' : 'g-dot g-dot--off'} />
            <p>
              My cards
              <span>{ownCardCount ? `${ownCardCount} registered` : 'No cards registered'}</span>
            </p>
            <CreditCard size={18} />
          </div>
          {loggedInUser?.role === 'admin' && (
            <div className="g-list__row">
              <i className={totalCards ? 'g-dot g-dot--ok' : 'g-dot g-dot--off'} />
              <p>
                Household cards
                <span>{totalCards} active across {users.length} users</span>
              </p>
              <Shield size={18} />
            </div>
          )}
        </div>
      ) : (
        <div className={`g-stack ${pageLayout ? 'access-nfc-body' : ''}`}>
          {pageLayout ? (
            <div className="access-nfc-summary" aria-label="Card summary">
              <div><strong>{ownCardCount}</strong><span>My cards</span></div>
              <div><strong>{totalCards}</strong><span>Total cards</span></div>
              <div><strong>{users.length}</strong><span>People</span></div>
            </div>
          ) : (
            <div className="dash-modal-grid">
              <div className="g-tile">
                <p className="g-label">My cards</p>
                <div className="g-metric-sm g-num">{ownCardCount}</div>
              </div>
              <div className="g-tile">
                <p className="g-label">Total cards</p>
                <div className="g-metric-sm g-num">{totalCards}</div>
              </div>
              <div className="g-tile">
                <p className="g-label">People</p>
                <div className="g-metric-sm g-num">{users.length}</div>
              </div>
            </div>
          )}
          {loading && <ContentSkeleton label="Loading card holders and reader state." rows={3} tiles={pageLayout ? 0 : 3} />}
          {isAdminView ? renderAdminView() : renderUserView()}
        </div>
      )}

      {removalModal.render && shownRemoval && (
        <ModalPortal>
          <div className={removalModal.className} role="dialog" aria-modal="true" aria-labelledby="nfc-remove-title" onClick={() => setPendingRemoval(null)}>
            <div className="g-pane g-modal__card" style={{ width: 'min(100%, 440px)' }} onClick={(event) => event.stopPropagation()}>
              <div className="g-modal__head">
                <div>
                  <h2 id="nfc-remove-title">Revoke {shownRemoval.userName}&apos;s card?</h2>
                  <p>Card {formatCardId(shownRemoval.cardId)} will stop unlocking doors immediately.</p>
                </div>
                <button className="g-icon-btn" onClick={() => setPendingRemoval(null)} aria-label="Close">
                  <X size={15} />
                </button>
              </div>
              <div className="g-modal__foot">
                <button className="g-btn g-btn--ghost" onClick={() => setPendingRemoval(null)} disabled={loading}>Keep card</button>
                <button className="g-btn g-btn--danger" onClick={handleConfirmRemoval} disabled={loading}>
                  Revoke card
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
