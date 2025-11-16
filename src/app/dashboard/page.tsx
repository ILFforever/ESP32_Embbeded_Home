'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { AlertsCard } from '@/components/dashboard/AlertsCard';
import { TemperatureCard } from '@/components/dashboard/TemperatureCard';
import { GasReadingsCard } from '@/components/dashboard/GasReadingsCard';
import { DoorsWindowsCard } from '@/components/dashboard/DoorsWindowsCard';
import { DoorbellControlCard } from '@/components/dashboard/DoorbellControlCard';
import { SecurityCard } from '@/components/dashboard/SecurityCard';
import { SystemStatusCard } from '@/components/dashboard/SystemStatusCard';
import {
  getAllDevices,
  generateMockAlerts,
  generateMockTemperatureData,
  generateMockGasReadings,
  generateMockDoorsWindows,
  generateMockDoorbellControl,
  generateMockSecurityDevices
} from '@/services/devices.service';
import type { DevicesStatus } from '@/types/dashboard';

export default function DashboardPage() {
  const router = useRouter();
  const [devicesStatus, setDevicesStatus] = useState<DevicesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'purple' | 'green'>('purple');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const devices = await getAllDevices();
        setDevicesStatus(devices);
      } catch (error) {
        console.error('Error loading devices:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
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
    localStorage.removeItem('isAuthenticated');
    router.push('/login');
  };

  const openExpandedCard = (cardId: string) => {
    setExpandedCard(cardId);
  };

  const closeExpandedCard = () => {
    setExpandedCard(null);
  };

  // Generate mock data
  const alerts = generateMockAlerts();
  const temperatureData = generateMockTemperatureData();
  const gasReadings = generateMockGasReadings();
  const doorsWindows = generateMockDoorsWindows();
  const doorbellControl = generateMockDoorbellControl();
  const securityDevices = generateMockSecurityDevices();

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
        content = <TemperatureCard temperatureData={temperatureData} />;
        break;
      case 'gas':
        content = <GasReadingsCard gasReadings={gasReadings} />;
        break;
      case 'doors':
        content = <DoorsWindowsCard doorsWindows={doorsWindows} />;
        break;
      case 'doorbell':
        content = <DoorbellControlCard doorbellControl={doorbellControl} />;
        break;
      case 'security':
        content = <SecurityCard securityDevices={securityDevices} />;
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
          <div className="sidebar-logo">Smart Home</div>
          <button className="sidebar-toggle" onClick={toggleSidebar}>
            ☰
          </button>
        </div>
        <nav>
          <ul className="sidebar-nav">
            <li className="sidebar-nav-item">
              <div className="sidebar-nav-link active">
                <span className="sidebar-nav-icon">🏠</span>
                <span>Dashboard</span>
              </div>
            </li>
            <li className="sidebar-nav-item">
              <div className="sidebar-nav-link">
                <span className="sidebar-nav-icon">🔔</span>
                <span>Alerts</span>
              </div>
            </li>
            <li className="sidebar-nav-item">
              <div className="sidebar-nav-link">
                <span className="sidebar-nav-icon">📊</span>
                <span>Analytics</span>
              </div>
            </li>
            <li className="sidebar-nav-item">
              <div className="sidebar-nav-link">
                <span className="sidebar-nav-icon">🔧</span>
                <span>Devices</span>
              </div>
            </li>
            <li className="sidebar-nav-item">
              <div className="sidebar-nav-link">
                <span className="sidebar-nav-icon">📹</span>
                <span>Cameras</span>
              </div>
            </li>
            <li className="sidebar-nav-item">
              <div className="sidebar-nav-link">
                <span className="sidebar-nav-icon">⚙️</span>
                <span>Settings</span>
              </div>
            </li>
          </ul>
        </nav>
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
              <h1>SMART HOME CONTROL SYSTEM</h1>
            </div>

            <div className="dashboard-header-right">
              <div className="header-info">
                <span className="status-dot status-online"></span>
                <span>ALL SYSTEMS OPERATIONAL</span>
              </div>

              {/* Theme Switcher */}
              <div className="theme-switcher">
                <span className="theme-switcher-label">Theme</span>
                <div className="theme-toggle" data-theme={theme} onClick={toggleTheme}>
                  <div className="theme-toggle-slider"></div>
                  <span className="theme-icon theme-icon-purple">●</span>
                  <span className="theme-icon theme-icon-green">●</span>
                </div>
              </div>

              {/* Logout Button */}
              <button className="btn-logout" onClick={handleLogout}>
                <span>Logout</span>
                <span>→</span>
              </button>
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
              <TemperatureCard temperatureData={temperatureData} />
            </div>

            {/* Row 3: 4 cards */}
            <div
              className="card-row3-1"
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

            <div
              className="card-row3-2"
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
              className="card-row3-3"
              onClick={() => openExpandedCard('doorbell')}
            >
              <button className="card-eye-icon" onClick={(e) => { e.stopPropagation(); openExpandedCard('doorbell'); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <DoorbellControlCard doorbellControl={doorbellControl} />
            </div>

            <div
              className="card-row3-4"
              onClick={() => openExpandedCard('security')}
            >
              <button className="card-eye-icon" onClick={(e) => { e.stopPropagation(); openExpandedCard('security'); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <SecurityCard securityDevices={securityDevices} />
            </div>
          </div>

          {/* Expanded Card Modal */}
          {renderExpandedCard()}
        </div>
      </div>
    </ProtectedRoute>
  );
}
