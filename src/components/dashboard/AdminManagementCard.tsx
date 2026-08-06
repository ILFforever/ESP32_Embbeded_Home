'use client';

import React, { useState } from 'react';
import { BellRing, CheckCircle, Copy, Cpu, Home, Plus, Shield, Trash2, UserPlus, Users, X } from 'lucide-react';
import { UserData, deleteAdmin, deleteUser, getAdmins, getUsers, registerUser } from '@/services/auth.service';
import { deleteDevice, getDeviceStatusText, registerDevice } from '@/services/devices.service';
import type { BackendDevice } from '@/types/dashboard';

interface AdminManagementCardProps {
  isExpanded?: boolean;
  devices?: BackendDevice[];
  /**
   * Drop the card's own "Admin" heading. The /admin page carries the same
   * words in its page title, and two identical headings stacked on top of
   * each other read as a rendering bug.
   */
  hideHeader?: boolean;
  /**
   * Give People and Devices a pane each, the way admin.html has them.
   * Off inside the dashboard modal: a pane nested in the modal's own pane
   * is a border and a blur the design system does not use there.
   */
  sectioned?: boolean;
}

interface AddUserFormData {
  name: string;
  telephone_number: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
}

interface AddDeviceFormData {
  device_id: string;
  device_type: string;
  name: string;
}

type DeleteTarget =
  | { kind: 'admin'; id: string; name: string }
  | { kind: 'user'; id: string; name: string }
  | { kind: 'device'; id: string; name: string };

const emptyUserForm: AddUserFormData = {
  name: '',
  telephone_number: '',
  email: '',
  password: '',
  role: 'user',
};

const emptyDeviceForm: AddDeviceFormData = {
  device_id: '',
  device_type: 'sensor',
  name: '',
};

function DeviceIcon({ type }: { type: string }) {
  const Icon = type.toLowerCase() === 'doorbell'
    ? BellRing
    : type.toLowerCase() === 'hub' || type.toLowerCase() === 'main_lcd'
      ? Home
      : Cpu;
  return <Icon size={18} aria-hidden="true" />;
}

function StatusChip({ online, lastSeen, type }: { online: boolean; lastSeen?: string | null; type: string }) {
  const label = getDeviceStatusText(online, lastSeen || null, type);
  const tone = online ? 'g-chip--ok' : 'g-chip--warn';
  return <span className={`g-chip ${tone}`}>{label}</span>;
}

export function AdminManagementCard({
  isExpanded = false,
  devices = [],
  hideHeader = false,
  sectioned = false,
}: AdminManagementCardProps) {
  const sectionClass = sectioned ? 'g-pane g-card g-stack' : 'g-stack';

  const [admins, setAdmins] = React.useState<UserData[]>([]);
  const [users, setUsers] = React.useState<UserData[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [formData, setFormData] = useState<AddUserFormData>(emptyUserForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAddDeviceForm, setShowAddDeviceForm] = useState(false);
  const [deviceFormData, setDeviceFormData] = useState<AddDeviceFormData>(emptyDeviceForm);
  const [deviceFormError, setDeviceFormError] = useState<string | null>(null);
  const [registeredToken, setRegisteredToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  React.useEffect(() => {
    fetchData();
  }, []);

  React.useEffect(() => {
    if (isExpanded) fetchData();
  }, [isExpanded]);

  React.useEffect(() => {
    if (!deleteTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeleteTarget(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [deleteTarget]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [adminsData, usersData] = await Promise.all([getAdmins(), getUsers()]);
      setAdmins(adminsData);
      setUsers(usersData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
      console.error('Error fetching admin/user data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setFormError(null);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!/^\d{3}-\d{7}$/.test(formData.telephone_number)) {
      setFormError('Use the phone format XXX-XXXXXXX.');
      return;
    }

    if (formData.password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    try {
      const result = await registerUser(formData);
      if (result.success) {
        await fetchData();
        setFormData(emptyUserForm);
        setShowAddUserForm(false);
      } else {
        setFormError(result.message || 'Failed to add user');
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to add user');
    }
  };

  const handleDeviceFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setDeviceFormData(prev => ({ ...prev, [name]: value }));
    setDeviceFormError(null);
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeviceFormError(null);

    if (!/^[a-zA-Z0-9_]+$/.test(deviceFormData.device_id)) {
      setDeviceFormError('Device ID can only use letters, numbers, and underscores.');
      return;
    }

    try {
      const result = await registerDevice(deviceFormData);
      if (result.status === 'ok') {
        setRegisteredToken(result.api_token);
        setDeviceFormData(emptyDeviceForm);
      } else {
        setDeviceFormError(result.message || 'Failed to register device');
      }
    } catch (err: any) {
      setDeviceFormError(err.message || 'Failed to register device');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActionError(null);

    try {
      if (deleteTarget.kind === 'admin') {
        const result = await deleteAdmin(deleteTarget.id);
        if (!result.success) {
          setActionError(result.message || 'Failed to delete admin');
          return;
        }
        setAdmins(admins.filter(admin => admin.id !== deleteTarget.id));
      }

      if (deleteTarget.kind === 'user') {
        const result = await deleteUser(deleteTarget.id);
        if (!result.success) {
          setActionError(result.message || 'Failed to delete user');
          return;
        }
        setUsers(users.filter(user => user.id !== deleteTarget.id));
      }

      if (deleteTarget.kind === 'device') {
        const result = await deleteDevice(deleteTarget.id);
        if (result.status !== 'ok') {
          setActionError(result.message || 'Failed to delete device');
          return;
        }
        window.location.reload();
      }

      setDeleteTarget(null);
    } catch (err: any) {
      setActionError(err.message || `Failed to delete ${deleteTarget.kind}`);
    }
  };

  const handleCopyToken = async () => {
    if (!registeredToken) return;
    try {
      await navigator.clipboard.writeText(registeredToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch (err) {
      setDeviceFormError('Copy failed. Select the token and copy it manually.');
      console.error('Failed to copy token:', err);
    }
  };

  const closeDeviceForm = () => {
    setShowAddDeviceForm(false);
    setDeviceFormError(null);
    setRegisteredToken(null);
    setTokenCopied(false);
  };

  const openUserForm = (role: 'user' | 'admin') => {
    setFormData(prev => ({ ...prev, role }));
    setFormError(null);
    setShowAddUserForm(true);
  };

  const renderUserForm = () => (
    <form onSubmit={handleAddUser} className="g-pane g-card g-stack">
      <div className="g-row g-row--between">
        <h3>Add {formData.role}</h3>
        <button type="button" className="g-icon-btn" onClick={() => setShowAddUserForm(false)} aria-label="Close add person form">
          <X size={16} />
        </button>
      </div>

      {formError && <div className="g-chip g-chip--crit" role="alert">{formError}</div>}

      <div className="g-grid g-grid--2">
        <label className="g-field">
          <span>Role</span>
          <select name="role" value={formData.role} onChange={handleFormChange} required>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="g-field">
          <span>Name</span>
          <input type="text" name="name" value={formData.name} onChange={handleFormChange} required placeholder="Full name" />
        </label>
        <label className="g-field">
          <span>Email</span>
          <input type="email" name="email" value={formData.email} onChange={handleFormChange} required placeholder="email@example.com" />
        </label>
        <label className="g-field">
          <span>Phone</span>
          <input type="text" name="telephone_number" value={formData.telephone_number} onChange={handleFormChange} required placeholder="012-3456789" pattern="\d{3}-\d{7}" />
        </label>
        <label className="g-field">
          <span>Password</span>
          <input type="password" name="password" value={formData.password} onChange={handleFormChange} required minLength={6} placeholder="At least 6 characters" />
        </label>
      </div>

      <div className="g-row">
        <button type="submit" className="g-btn g-btn--primary">Add {formData.role}</button>
      </div>
    </form>
  );

  const renderDeviceForm = () => (
    <form onSubmit={handleAddDevice} className="g-pane g-card g-stack">
      <div className="g-row g-row--between">
        <h3>Register device</h3>
        <button type="button" className="g-icon-btn" onClick={closeDeviceForm} aria-label="Close device form">
          <X size={16} />
        </button>
      </div>

      {deviceFormError && <div className="g-chip g-chip--crit" role="alert">{deviceFormError}</div>}

      {registeredToken ? (
        <div className="g-stack">
          <div className="g-chip g-chip--ok"><CheckCircle size={14} /> Device registered</div>
          <p className="g-sub">Save this API token now. It will not be shown again.</p>
          <div className="g-input-group">
            <input className="g-mono" type="text" value={registeredToken} readOnly aria-label="New device API token" />
          </div>
          <div className="g-row">
            <button type="button" className="g-btn g-btn--primary" onClick={handleCopyToken}>
              {tokenCopied ? <CheckCircle size={16} /> : <Copy size={16} />}
              {tokenCopied ? 'Copied' : 'Copy token'}
            </button>
            <button type="button" className="g-btn g-btn--ghost" onClick={closeDeviceForm}>Close</button>
          </div>
        </div>
      ) : (
        <>
          <div className="g-grid g-grid--2">
            <label className="g-field">
              <span>Device type</span>
              <select name="device_type" value={deviceFormData.device_type} onChange={handleDeviceFormChange} required>
                <option value="sensor">Sensor</option>
                <option value="doorbell">Doorbell</option>
                <option value="hub">Hub</option>
                <option value="main_lcd">Main LCD</option>
                <option value="main_mesh">Main Mesh</option>
              </select>
            </label>
            <label className="g-field">
              <span>Device ID</span>
              <input type="text" name="device_id" value={deviceFormData.device_id} onChange={handleDeviceFormChange} required placeholder="db_001" pattern="[a-zA-Z0-9_]+" />
            </label>
            <label className="g-field">
              <span>Device name</span>
              <input type="text" name="name" value={deviceFormData.name} onChange={handleDeviceFormChange} placeholder="Front doorbell" />
            </label>
          </div>
          <button type="submit" className="g-btn g-btn--primary">Register device</button>
        </>
      )}
    </form>
  );

  const peopleRows = [
    ...admins.map(admin => ({ id: admin.id, name: admin.name, email: admin.email, phone: admin.telephone_number, role: 'Admin' as const })),
    ...users.map(user => ({ id: user.id, name: user.name, email: user.email, phone: user.telephone_number, role: 'User' as const })),
  ];

  return (
    <>
      <div className="g-stack">
        {!hideHeader && (
          <header>
            <div className="g-row g-row--between">
              <h2>Admin</h2>
              <Shield size={18} aria-hidden="true" />
            </div>
            <p className="g-sub">People, access roles, and enrolled boards.</p>
          </header>
        )}

        {!isExpanded ? (
          <div className="g-grid g-grid--3 g-grid--stats">
            <div className="g-tile"><p className="g-label">Admins</p><div className="g-metric-sm g-num">{admins.length}</div></div>
            <div className="g-tile"><p className="g-label">Users</p><div className="g-metric-sm g-num">{users.length}</div></div>
            <div className="g-tile"><p className="g-label">Devices</p><div className="g-metric-sm g-num">{devices.length}</div></div>
          </div>
        ) : (
          <div className="g-stack">
            {loading && <div className="g-empty"><strong>Loading people</strong><p>Fetching admin and user records.</p></div>}
            {error && <div className="g-chip g-chip--crit" role="alert">{error}</div>}

            {/* Each action sits in the header of the thing it changes, the
                way admin.html has it. A shared row above both tables meant
                "Register device" was three buttons away from the device
                table and adjacent to the people one. */}
            <section className={sectionClass}>
              {/* --wrap: on a phone the title and its two buttons do not fit
                  on one line, and without it they interleave instead of
                  stacking. */}
              <div className="g-row g-row--between g-row--wrap">
                <div className="g-row">
                  <h3>People</h3>
                  <span className="g-chip">{peopleRows.length} total</span>
                </div>
                <div className="g-row g-row--wrap">
                  <button className="g-btn g-btn--primary" onClick={() => openUserForm('admin')}><UserPlus size={16} /> Add admin</button>
                  <button className="g-btn g-btn--ghost" onClick={() => openUserForm('user')}><UserPlus size={16} /> Add user</button>
                </div>
              </div>
              {showAddUserForm && renderUserForm()}
              {peopleRows.length === 0 && !loading ? (
                <div className="g-empty"><Users size={22} /><strong>No people found</strong><p>Add an admin or user to grant access.</p></div>
              ) : (
                <div className="g-scroll">
                  <table className="g-table" aria-label="Administrators and users">
                    <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th className="g-num-cell">Action</th></tr></thead>
                    <tbody>
                      {peopleRows.map(person => (
                        <tr key={`${person.role}-${person.id}`}>
                          <td><span className="g-row"><span className="g-dot g-dot--ok"></span>{person.name}</span></td>
                          <td>{person.email}</td>
                          <td className="g-mono">{person.phone}</td>
                          <td><span className="g-chip">{person.role}</span></td>
                          <td className="g-num-cell">
                            <button className="g-btn g-btn--ghost" onClick={() => setDeleteTarget({ kind: person.role === 'Admin' ? 'admin' : 'user', id: person.id, name: person.name })}>
                              <Trash2 size={15} /> Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={sectionClass}>
              <div className="g-row g-row--between g-row--wrap">
                <div className="g-row">
                  <h3>Devices</h3>
                  <span className="g-chip">{devices.length} enrolled</span>
                </div>
                <button className="g-btn g-btn--primary" onClick={() => setShowAddDeviceForm(true)}><Plus size={16} /> Register device</button>
              </div>
              {showAddDeviceForm && renderDeviceForm()}
              {devices.length === 0 && !loading ? (
                <div className="g-empty"><Cpu size={22} /><strong>No devices found</strong><p>Register a board to issue an API token.</p></div>
              ) : (
                <div className="g-scroll">
                  <table className="g-table" aria-label="Enrolled devices">
                    <thead><tr><th>Device</th><th>ID</th><th>Type</th><th>Status</th><th className="g-num-cell">Action</th></tr></thead>
                    <tbody>
                      {devices.map(device => (
                        <tr key={device.device_id}>
                          <td><span className="g-row"><DeviceIcon type={device.type} />{device.name}</span></td>
                          <td className="g-mono">{device.device_id}</td>
                          <td>{device.type}</td>
                          <td><StatusChip online={device.online} lastSeen={device.last_seen} type={device.type} /></td>
                          <td className="g-num-cell">
                            <button className="g-btn g-btn--ghost" onClick={() => setDeleteTarget({ kind: 'device', id: device.device_id, name: device.name })}>
                              <Trash2 size={15} /> Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="g-modal" role="dialog" aria-modal="true" aria-labelledby="admin-remove-title" onClick={() => setDeleteTarget(null)}>
          <div className="g-pane g-modal__card" onClick={(event) => event.stopPropagation()}>
            <div className="g-modal__head">
              <div>
                <h2 id="admin-remove-title">Remove {deleteTarget.name}</h2>
                <p>This removes {deleteTarget.kind === 'device' ? 'the enrolled device and its data' : 'this person from access'} immediately.</p>
              </div>
              <button className="g-icon-btn" onClick={() => setDeleteTarget(null)} aria-label="Close"><X size={16} /></button>
            </div>
            {actionError && <div className="g-chip g-chip--crit" role="alert">{actionError}</div>}
            <div className="g-modal__foot">
              <button className="g-btn g-btn--ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="g-btn g-btn--danger" onClick={confirmDelete}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
