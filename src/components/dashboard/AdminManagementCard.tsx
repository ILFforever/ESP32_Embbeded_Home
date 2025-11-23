'use client';

import React, { useState } from 'react';
import { Shield, UserPlus, Trash2, Users, User, Cpu, Plus, X, BellRing, Home } from 'lucide-react';
import { UserData, getAdmins, getUsers, deleteAdmin, deleteUser, registerUser } from '@/services/auth.service';
import { getDeviceStatusClass, getDeviceStatusText } from '@/services/devices.service';
import type { BackendDevice } from '@/types/dashboard';

interface AdminManagementCardProps {
  isExpanded?: boolean;
  devices?: BackendDevice[];
}

interface AddUserFormData {
  name: string;
  telephone_number: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
}

export function AdminManagementCard({ isExpanded = false, devices = [] }: AdminManagementCardProps) {
  const [admins, setAdmins] = React.useState<UserData[]>([]);
  const [users, setUsers] = React.useState<UserData[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [formData, setFormData] = useState<AddUserFormData>({
    name: '',
    telephone_number: '',
    email: '',
    password: '',
    role: 'user'
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Helper function to get the appropriate icon for each device type
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'doorbell':
        return BellRing;
      case 'hub':
      case 'main_lcd':
        return Home;
      default:
        return Cpu;
    }
  };

  // Fetch admins and users on component mount
  React.useEffect(() => {
    fetchData();
  }, []);

  // Refresh data when expanded
  React.useEffect(() => {
    if (isExpanded) {
      fetchData();
    }
  }, [isExpanded]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [adminsData, usersData] = await Promise.all([
        getAdmins(),
        getUsers()
      ]);
      setAdmins(adminsData);
      setUsers(usersData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
      console.error('Error fetching admin/user data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (!confirm('Are you sure you want to delete this admin?')) return;

    try {
      const result = await deleteAdmin(adminId);
      if (result.success) {
        setAdmins(admins.filter(admin => admin.id !== adminId));
      } else {
        alert(result.message || 'Failed to delete admin');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete admin');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const result = await deleteUser(userId);
      if (result.success) {
        setUsers(users.filter(user => user.id !== userId));
      } else {
        alert(result.message || 'Failed to delete user');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
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

    // Validate phone number format
    if (!/^\d{3}-\d{7}$/.test(formData.telephone_number)) {
      setFormError('Telephone number must be in format XXX-XXXXXXX');
      return;
    }

    // Validate password length
    if (formData.password.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }

    try {
      const result = await registerUser(formData);
      if (result.success) {
        // Refresh the data
        await fetchData();
        // Reset form
        setFormData({
          name: '',
          telephone_number: '',
          email: '',
          password: '',
          role: 'user'
        });
        setShowAddUserForm(false);
      } else {
        setFormError(result.message || 'Failed to add user');
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to add user');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          <Shield size={20} />
          <h3>ADMINISTRATION</h3>
        </div>
      </div>

      <div className="card-content">
        {!isExpanded ? (
          /* Compact view */
          <div className="security-compact">
            <div className="security-overview">
              <div className="overview-item">
                <Users size={20} />
                <span className="status-indicator">
                  {admins.length}
                </span>
              </div>
              <div className="overview-item">
                <User size={20} />
                <span className="status-indicator">
                  {users.length}
                </span>
              </div>
              <div className="overview-item">
                <Cpu size={20} />
                <span>DEVICES</span>
                <span className="status-indicator">
                  {devices.length}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Expanded view */
          <div className="security-expanded">
            {loading && <div className="loading-message">Loading...</div>}
            {error && <div className="error-message">{error}</div>}

            {/* Add User Form */}
            {showAddUserForm && (
              <div className="add-user-form-container">
                <form onSubmit={handleAddUser} className="add-user-form">
                  <div className="form-header">
                    <h4>ADD NEW {formData.role.toUpperCase()}</h4>
                    <button
                      type="button"
                      className="btn-close-form"
                      onClick={() => {
                        setShowAddUserForm(false);
                        setFormError(null);
                      }}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {formError && <div className="form-error">{formError}</div>}

                  <div className="form-group">
                    <label>Role</label>
                    <select name="role" value={formData.role} onChange={handleFormChange} required>
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleFormChange}
                      required
                      placeholder="Full Name"
                    />
                  </div>

                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleFormChange}
                      required
                      placeholder="email@example.com"
                    />
                  </div>

                  <div className="form-group">
                    <label>Phone (XXX-XXXXXXX)</label>
                    <input
                      type="text"
                      name="telephone_number"
                      value={formData.telephone_number}
                      onChange={handleFormChange}
                      required
                      placeholder="012-3456789"
                      pattern="\d{3}-\d{7}"
                    />
                  </div>

                  <div className="form-group">
                    <label>Password (min 6 characters)</label>
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleFormChange}
                      required
                      minLength={6}
                      placeholder="••••••"
                    />
                  </div>

                  <div className="form-actions">
                    <button type="submit" className="btn-action btn-submit">
                      ADD {formData.role.toUpperCase()}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Admins Section */}
            <div className="security-section">
              <div className="section-header">
                <h4>ADMINS ({admins.length})</h4>
                <div className="section-actions">
                  <button
                    className="btn-action-sm btn-add"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, role: 'admin' }));
                      setShowAddUserForm(true);
                    }}
                  >
                    <UserPlus size={16} />
                    ADD ADMIN
                  </button>
                </div>
              </div>
              <div className="devices-grid">
                {admins.length === 0 && !loading && (
                  <div className="empty-message">No admins found</div>
                )}
                {admins.map(admin => (
                  <div key={admin.id} className="security-device-card">
                    <div className="device-header">
                      <Users className="device-icon" size={24} />
                      <div className="device-info-header">
                        <h5>{admin.name}</h5>
                        <span className="device-location">{admin.email}</span>
                      </div>
                    </div>
                    
                    <div className="admin-info">
                      <span className="info-label">Phone:</span>
                      <span className="info-value">{admin.telephone_number}</span>
                    </div>
                    <div className="device-actions">
                      <button
                        className="btn-action btn-delete"
                        onClick={() => handleDeleteAdmin(admin.id)}
                      >
                        <Trash2 size={16} />
                        REMOVE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Users Section */}
            <div className="security-section">
              <div className="section-header">
                <h4>USERS ({users.length})</h4>
                <div className="section-actions">
                  <button
                    className="btn-action-sm btn-add"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, role: 'user' }));
                      setShowAddUserForm(true);
                    }}
                  >
                    <UserPlus size={16} />
                    ADD USER
                  </button>
                </div>
              </div>
              <div className="devices-grid">
                {users.length === 0 && !loading && (
                  <div className="empty-message">No users found</div>
                )}
                {users.map(user => (
                  <div key={user.id} className="security-device-card">
                    <div className="device-header">
                      <User className="device-icon" size={24} />
                      <div className="device-info-header">
                        <h5>{user.name}</h5>
                        <span className="device-location">{user.email}</span>
                      </div>
                    </div>
                    
                    <div className="admin-info">
                      <span className="info-label">Phone:</span>
                      <span className="info-value">{user.telephone_number}</span>
                    </div>
                    <div className="device-actions">
                      <button
                        className="btn-action btn-delete"
                        onClick={() => handleDeleteUser(user.id)}
                      >
                        <Trash2 size={16} />
                        REMOVE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Devices Section */}
            <div className="security-section">
              <div className="section-header">
                <h4>DEVICES / BOARDS ({devices.length})</h4>
                <div className="section-actions">
                  <button
                    className="btn-action-sm btn-add"
                    disabled
                    title="Register devices via ESP32 board"
                  >
                    <Plus size={16} />
                    REGISTER DEVICE
                  </button>
                </div>
              </div>
              <div className="devices-grid">
                {devices.length === 0 && !loading && (
                  <div className="empty-message">No devices found</div>
                )}
                {devices.map(device => {
                  const DeviceIcon = getDeviceIcon(device.type);
                  return (
                    <div key={device.device_id} className="security-device-card">
                      <div className="device-header">
                        <DeviceIcon className="device-icon" size={24} />
                        <div className="device-info-header">
                          <h5>{device.name}</h5>
                          <span className="device-location">{device.type}</span>
                        </div>
                      </div>
                      <div className="device-status-container">
                        <span className={`status-indicator ${getDeviceStatusClass(device.online, device.last_seen)}`}>
                          {getDeviceStatusText(device.online, device.last_seen)}
                        </span>
                      </div>
                      <div className="admin-info">
                        <span className="info-label">Device ID:</span>
                        <span className="info-value" style={{ fontSize: '0.8em' }}>{device.device_id}</span>
                      </div>
                      <div className="device-actions">
                        <button
                          className="btn-action btn-delete"
                          disabled
                          title="Device deletion not implemented yet"
                        >
                          <Trash2 size={16} />
                          REMOVE
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .add-user-form-container {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--primary-color);
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .add-user-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .form-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .form-header h4 {
          color: var(--primary-color);
          font-size: 1.1rem;
          font-weight: 600;
          letter-spacing: 1px;
          margin: 0;
        }

        .btn-close-form {
          background: none;
          border: none;
          color: #FF6600;
          cursor: pointer;
          padding: 0.25rem;
          transition: all 0.2s;
        }

        .btn-close-form:hover {
          color: #FF0000;
          transform: scale(1.1);
        }

        .form-error {
          background: rgba(255, 0, 0, 0.1);
          border: 1px solid #FF6600;
          color: #FF6600;
          padding: 0.75rem;
          border-radius: 4px;
          font-size: 0.9rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group label {
          color: var(--primary-color);
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .form-group input,
        .form-group select {
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(var(--primary-color-rgb), 0.3);
          border-radius: 4px;
          color: #FFF;
          padding: 0.75rem;
          font-size: 0.95rem;
          font-family: 'Courier New', monospace;
          transition: all 0.2s;
        }

        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: var(--primary-color);
          box-shadow: 0 0 8px rgba(var(--primary-color-rgb), 0.3);
        }

        .form-group input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 0.5rem;
        }

        .btn-submit {
          background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
          padding: 0.75rem 1.5rem;
        }

        .btn-submit:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(var(--primary-color-rgb), 0.4);
        }

        .btn-add {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
        }

        .btn-add:hover {
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(var(--primary-color-rgb), 0.4);
        }

        .btn-delete {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: linear-gradient(135deg, #FF6600, #FF0000);
        }

        .btn-delete:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(255, 102, 0, 0.4);
        }

        .btn-delete:disabled {
          opacity: 0.3;
          cursor: not-allowed;
          transform: none;
        }

        .btn-delete:disabled:hover {
          transform: none;
          box-shadow: none;
        }

        .admin-info {
          display: flex;
          gap: 0.5rem;
          font-size: 0.85rem;
          padding: 0.5rem 0;
        }

        .info-label {
          color: rgba(255, 255, 255, 0.5);
        }

        .info-value {
          color: var(--primary-color);
          font-weight: 600;
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

        .btn-action-sm:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
