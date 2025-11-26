'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { AlertsCard } from '@/components/dashboard/AlertsCard';
import { TemperatureCard } from '@/components/dashboard/TemperatureCard';
import { GasReadingsCard } from '@/components/dashboard/GasReadingsCard';
import { DoorsWindowsCard } from '@/components/dashboard/DoorsWindowsCard';
import { AdminManagementCard } from '@/components/dashboard/AdminManagementCard';
import { SystemStatusCard } from '@/components/dashboard/SystemStatusCard';
import {
  getAllDevices,
  generateMockAlerts,
  getGasReadingsForDashboard,
  generateMockDoorsWindows
} from '@/services/devices.service';
import type { DevicesStatus, GasReading } from '@/types/dashboard';

export default function DashboardPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [devicesStatus, setDevicesStatus] = useState<DevicesStatus | null>(null);
  const [gasReadings, setGasReadings] = useState<GasReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'purple' | 'green'>('purple');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [systemOnline, setSystemOnline] = useState<boolean>(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch devices status
        const devices = await getAllDevices();
        setDevicesStatus(devices);

        // Fetch gas sensor readings
        const gasData = await getGasReadingsForDashboard();
        setGasReadings(gasData);

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
        openExpandedCard('admin');
        break;
      case 'settings':
        openExpandedCard('admin');
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

  // Generate mock data for features not yet implemented
  const alerts = generateMockAlerts();
  const doorsWindows = generateMockDoorsWindows();

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
        content = <AlertsCard alerts={alerts} isExpanded={true} />;
        break;
      case 'temperature':
        content = <TemperatureCard isExpanded={true} />;
        break;
      case 'gas':
        content = <GasReadingsCard gasReadings={gasReadings} isExpanded={true} />;
        break;
      case 'doors':
        content = <DoorsWindowsCard doorsWindows={doorsWindows} isExpanded={true} />;
        break;
      case 'admin':
        content = <AdminManagementCard devices={devicesStatus?.devices || []} isExpanded={true} />;
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
            <li className="sidebar-nav-item">
              <div
                className={`sidebar-nav-link ${activeView === 'devices' ? 'active' : ''}`}
                onClick={() => handleMenuClick('devices')}
                style={{ cursor: 'pointer' }}
              >
                <span className="sidebar-nav-icon">🔧</span>
                <span>Devices</span>
              </div>
            </li>
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
                <span className={`status-dot ${systemOnline ? 'status-online' : 'status-offline'}`}></span>
                <span>{systemOnline ? 'ALL SYSTEMS OPERATIONAL' : 'SYSTEM OFFLINE'}</span>
              </div>
            </div>
          </header>

          {/* Dashboard Grid */}
          <div className="dashboard-grid">
            {/* Top-left: Large card (2×2) - System Status */}
            <div
              className="card-large-main"
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

            {/* Top-right row 1: Alerts */}
            <div
              className="card-top-right-1"
              onClick={() => openExpandedCard('alerts')}
            >
              <button className="card-eye-icon" onClick={(e) => { e.stopPropagation(); openExpandedCard('alerts'); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <AlertsCard alerts={alerts} />
            </div>

            {/* Top-right row 2: Temperature */}
            <div
              className="card-top-right-2"
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

            {/* Row 3: Doors/Windows (1 col), Admin (1 col), Gas (2 cols - same width as Temperature/Alerts) */}
            <div
              className="card-row3-1"
              onClick={() => openExpandedCard('doors')}
            >
              <button className="card-eye-icon" onClick={(e) => { e.stopPropagation(); openExpandedCard('doors'); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <DoorsWindowsCard doorsWindows={doorsWindows} />
            </div>

            <div
              className="card-row3-2"
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

            <div
              className="card-row3-3-wide"
              onClick={() => openExpandedCard('gas')}
            >
              <button className="card-eye-icon" onClick={(e) => { e.stopPropagation(); openExpandedCard('gas'); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <GasReadingsCard gasReadings={gasReadings} />
            </div>
          </div>

          {/* Expanded Card Modal */}
          {renderExpandedCard()}
        </div>
      </div>
    </ProtectedRoute>
  );
}
