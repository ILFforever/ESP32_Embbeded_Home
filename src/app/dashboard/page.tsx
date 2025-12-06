'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { AlertsCard } from '@/components/dashboard/AlertsCard';
import { TemperatureCard } from '@/components/dashboard/TemperatureCard';
import { GasReadingsCard } from '@/components/dashboard/GasReadingsCard';
import { DoorCard } from '@/components/dashboard/DoorCard';
import { AdminManagementCard } from '@/components/dashboard/AdminManagementCard';
import { SystemStatusCard } from '@/components/dashboard/SystemStatusCard';
import { MusicBroadcastCard } from '@/components/dashboard/MusicBroadcastCard';
import {
  getAllDevices,
  getAlerts,
  getGasReadingsForDashboard,
  getLockStatus
} from '@/services/devices.service';
import type { DevicesStatus, GasReading, Alert, DoorWindow } from '@/types/dashboard';

export default function DashboardPage() {
  const router = useRouter();
  const { logout, user } = useAuth();
  const [devicesStatus, setDevicesStatus] = useState<DevicesStatus | null>(null);
  const [gasReadings, setGasReadings] = useState<GasReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'purple' | 'green'>('purple');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [systemOnline, setSystemOnline] = useState<boolean>(false);
  const [allDevicesOnline, setAllDevicesOnline] = useState<boolean>(false);
  const [doorLockStates, setDoorLockStates] = useState<Record<string, 'locked' | 'unlocked'>>({});

  const fetchAlerts = async () => {
    try {
      // Fetch all alerts with a limit of 50
      const alertsData = await getAlerts({ limit: 50 });
      setAlerts(alertsData);
    } catch (error) {
      console.error('Error loading alerts:', error);
    }
  };

  const fetchGasReadings = async () => {
    try {
      const gasData = await getGasReadingsForDashboard();
      setGasReadings(gasData);
    } catch (error) {
      console.error('Error loading gas readings:', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch devices status
        const devices = await getAllDevices();
        setDevicesStatus(devices);

        // Check if all devices are online
        const allOnline = devices.summary.offline === 0 && devices.summary.total > 0;
        setAllDevicesOnline(allOnline);

        // Fetch gas sensor readings
        const gasData = await getGasReadingsForDashboard();
        setGasReadings(gasData);

        // Fetch alerts
        await fetchAlerts();

        // Fetch door lock statuses
        const doorLocks = devices.devices.filter(d => d.device_id.startsWith('dl_'));
        const lockStates: Record<string, 'locked' | 'unlocked'> = {};
        for (const lock of doorLocks) {
          try {
            const status = await getLockStatus(lock.device_id);
            if (status) {
              lockStates[lock.device_id] = status.lock_state;
            }
          } catch (error) {
            console.error(`Error fetching lock status for ${lock.device_id}:`, error);
          }
        }
        setDoorLockStates(lockStates);

        // Check system status via /info endpoint
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
          const response = await fetch(`${apiUrl}/info`, {
            method: 'GET',
          });

          if (response.ok) {
            const data = await response.text();
            setSystemOnline(data.includes('Arduino-888-SmartHome is running!'));
          } else {
            setSystemOnline(false);
          }
        } catch (infoError) {
          console.error('Error checking system status:', infoError);
          setSystemOnline(false);
        }
      } catch (error) {
        console.error('Error loading devices:', error);
        setSystemOnline(false);
        setAllDevicesOnline(false);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Refresh every 5 seconds for more real-time updates
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'purple' ? 'green' : 'purple');
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleMenuClick = (menuItem: string) => {
    setActiveView(menuItem);

    // Handle specific menu actions
    switch (menuItem) {
      case 'alerts':
        openExpandedCard('alerts');
        break;
      case 'analytics':
        // Analytics view - could open a dedicated analytics card in the future
        openExpandedCard('system-status');
        break;
      case 'devices':
        // Only admins can access device management
        if (user?.role === 'admin') {
          openExpandedCard('admin');
        }
        break;
      case 'settings':
        // Only admins can access settings
        if (user?.role === 'admin') {
          openExpandedCard('admin');
        }
        break;
      default:
        // Dashboard view - close any expanded cards
        closeExpandedCard();
    }

    // Close sidebar on mobile after selection
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const openExpandedCard = (cardId: string) => {
    setExpandedCard(cardId);
  };

  const closeExpandedCard = () => {
    setExpandedCard(null);
  };

  // Get real door lock devices from backend (filter for dl_* devices)
  const doorsWindows = devicesStatus?.devices
    .filter(device => device.device_id.startsWith('dl_'))
    .map(device => ({
      id: device.device_id,
      name: device.name || device.device_id,
      location: 'Door',
      type: 'door' as const,
      status: doorLockStates[device.device_id] || 'locked',
      last_changed: device.last_seen || new Date().toISOString(),
      battery: device.battery,
      online: device.online
    })) || [];

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>LOADING SYSTEM...</p>
      </div>
    );
  }

  // Render expanded card content with more details
  const renderExpandedCard = () => {
    if (!expandedCard) return null;

    let content;
    switch (expandedCard) {
      case 'system-status':
        content = <SystemStatusCard devicesStatus={devicesStatus} isExpanded={true} />;
        break;
      case 'alerts':
        content = <AlertsCard alerts={alerts} isExpanded={true} onRefresh={fetchAlerts} />;
        break;
      case 'temperature':
        content = <TemperatureCard isExpanded={true} />;
        break;
      case 'gas':
        content = <GasReadingsCard gasReadings={gasReadings} isExpanded={true} onRefresh={fetchGasReadings} />;
        break;
      case 'doors':
        content = <DoorCard doorsWindows={doorsWindows} isExpanded={true} />;
        break;
      case 'admin':
        // Only admins can view admin management
        if (user?.role === 'admin') {
          content = <AdminManagementCard devices={devicesStatus?.devices || []} isExpanded={true} />;
        } else {
          content = null;
        }
        break;
      case 'music':
        content = <MusicBroadcastCard isExpanded={true} />;
        break;
      default:
        content = null;
    }

    return (
      <div className="modal-overlay" onClick={closeExpandedCard}>
        <button className="modal-close" onClick={closeExpandedCard}>
          ✕
        </button>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          {content}
        </div>
      </div>
    );
  };

  return (
    <ProtectedRoute>
      {/* Sidebar */}
      <aside className={`sidebar ${!sidebarOpen ? 'closed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">Arduino888 Smart Home</div>
          <button className="sidebar-toggle" onClick={toggleSidebar}>
            ☰
          </button>
        </div>
        <nav>
          <ul className="sidebar-nav">
            <li className="sidebar-nav-item">
              <div
                className={`sidebar-nav-link ${activeView === 'dashboard' ? 'active' : ''}`}
                onClick={() => handleMenuClick('dashboard')}
                style={{ cursor: 'pointer' }}
              >
                <span className="sidebar-nav-icon">🏠</span>
                <span>Dashboard</span>
              </div>
            </li>
            <li className="sidebar-nav-item">
              <div
                className={`sidebar-nav-link ${activeView === 'alerts' ? 'active' : ''}`}
                onClick={() => handleMenuClick('alerts')}
                style={{ cursor: 'pointer' }}
              >
                <span className="sidebar-nav-icon">🔔</span>
                <span>Alerts</span>
              </div>
            </li>
            <li className="sidebar-nav-item">
              <div
                className={`sidebar-nav-link ${activeView === 'analytics' ? 'active' : ''}`}
                onClick={() => handleMenuClick('analytics')}
                style={{ cursor: 'pointer' }}
              >
                <span className="sidebar-nav-icon">📊</span>
                <span>Analytics</span>
              </div>
            </li>
            {user?.role === 'admin' && (
              <li className="sidebar-nav-item">
                <div
                  className={`sidebar-nav-link ${activeView === 'settings' ? 'active' : ''}`}
                  onClick={() => handleMenuClick('settings')}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="sidebar-nav-icon">⚙️</span>
                  <span>Settings</span>
                </div>
              </li>
            )}
          </ul>
        </nav>

        {/* Sidebar Footer with Theme and Logout */}
        <div className="sidebar-footer">
          {/* Theme Switcher */}
          <div className="sidebar-theme-switcher">
            <span className="sidebar-label">Theme</span>
            <div className="theme-toggle" data-theme={theme} onClick={toggleTheme}>
              <div className="theme-toggle-slider"></div>
              <span className="theme-icon theme-icon-purple">●</span>
              <span className="theme-icon theme-icon-green">●</span>
            </div>
          </div>

          {/* Logout Button */}
          <button className="sidebar-logout-btn" onClick={handleLogout}>
            <span className="sidebar-nav-icon">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Sidebar Overlay for Mobile */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        onClick={toggleSidebar}
      ></div>

      {/* Main Content */}
      <div className={`main-content ${sidebarOpen ? 'with-sidebar' : ''}`}>
        <div className="dashboard-container">
          {/* Header */}
          <header className="dashboard-header">
            <div className="dashboard-header-left">
              {!sidebarOpen && (
                <button className="sidebar-toggle" onClick={toggleSidebar}>
                  ☰
                </button>
              )}
              <h1>Arduino888 Smart Home</h1>
            </div>

            <div className="dashboard-header-right">
              <div className="header-info">
                <span className={`status-dot ${systemOnline && allDevicesOnline ? 'status-online' : 'status-offline'}`}></span>
                <span>
                  {!systemOnline
                    ? 'SYSTEM OFFLINE'
                    : allDevicesOnline
                      ? 'ALL SYSTEMS OPERATIONAL'
                      : `${devicesStatus?.summary.offline || 0} DEVICE(S) OFFLINE`
                  }
                </span>
              </div>
            </div>
          </header>

          {/* Dashboard Grid */}
          <div className="dashboard-grid">
            {/* System Status - spans 2 rows x 2 columns */}
            <div
              className="dashboard-card grid-system-status"
              onClick={() => openExpandedCard('system-status')}
            >
              <button className="card-eye-icon" onClick={(e) => { e.stopPropagation(); openExpandedCard('system-status'); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <SystemStatusCard devicesStatus={devicesStatus} />
            </div>

            {/* Alerts - spans 2 rows x 2 columns */}
            <div
              className="dashboard-card grid-alerts"
              onClick={() => openExpandedCard('alerts')}
            >
              <button className="card-eye-icon" onClick={(e) => { e.stopPropagation(); openExpandedCard('alerts'); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <AlertsCard alerts={alerts} onRefresh={fetchAlerts} />
            </div>

            {/* Temperature - spans 1 row x 2 columns */}
            <div
              className="dashboard-card grid-temperature"
              onClick={() => openExpandedCard('temperature')}
            >
              <button className="card-eye-icon" onClick={(e) => { e.stopPropagation(); openExpandedCard('temperature'); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <TemperatureCard />
            </div>

            {/* Gas Readings - spans 1 row x 2 columns */}
            <div
              className="dashboard-card grid-gas"
              onClick={() => openExpandedCard('gas')}
            >
              <button className="card-eye-icon" onClick={(e) => { e.stopPropagation(); openExpandedCard('gas'); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <GasReadingsCard gasReadings={gasReadings} onRefresh={fetchGasReadings} />
            </div>

            {/* Doors/Windows - spans 1 row x 2 columns */}
            <div
              className="dashboard-card grid-doors"
              onClick={() => openExpandedCard('doors')}
            >
              <button className="card-eye-icon" onClick={(e) => { e.stopPropagation(); openExpandedCard('doors'); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <DoorCard doorsWindows={doorsWindows} />
            </div>

            {/* Admin Management - spans 1 row x 2 columns - Only visible to admins */}
            {user?.role === 'admin' && (
              <div
                className="dashboard-card grid-admin"
                onClick={() => openExpandedCard('admin')}
              >
                <button className="card-eye-icon" onClick={(e) => { e.stopPropagation(); openExpandedCard('admin'); }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
                <AdminManagementCard devices={devicesStatus?.devices || []} />
              </div>
            )}

            {/* Music Broadcast - spans 1 row x 2 columns */}
            <div
              className="dashboard-card grid-music"
              onClick={() => openExpandedCard('music')}
            >
              <button className="card-eye-icon" onClick={(e) => { e.stopPropagation(); openExpandedCard('music'); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <MusicBroadcastCard />
            </div>
          </div>

          {/* Expanded Card Modal */}
          {renderExpandedCard()}
        </div>
      </div>
    </ProtectedRoute>
  );
}
