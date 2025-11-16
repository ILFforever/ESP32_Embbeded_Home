'use client';

import React, { useEffect, useState } from 'react';
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
  const [devicesStatus, setDevicesStatus] = useState<DevicesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'purple' | 'green'>('purple');
  const [modalCard, setModalCard] = useState<React.ReactNode | null>(null);

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

  const openModal = (cardContent: React.ReactNode) => {
    setModalCard(cardContent);
  };

  const closeModal = () => {
    setModalCard(null);
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

  return (
    <ProtectedRoute>
      <div className="dashboard-container">
        {/* Theme Switcher */}
        <div className="theme-switcher">
          <span className="theme-switcher-label">Theme</span>
          <div className="theme-toggle" data-theme={theme} onClick={toggleTheme}>
            <div className="theme-toggle-slider"></div>
            <span className="theme-icon theme-icon-purple">●</span>
            <span className="theme-icon theme-icon-green">●</span>
          </div>
        </div>

        <header className="dashboard-header">
          <h1>SMART HOME CONTROL SYSTEM</h1>
          <div className="header-info">
            <span className="status-dot status-online"></span>
            <span>ALL SYSTEMS OPERATIONAL</span>
          </div>
        </header>

        <div className="dashboard-grid">
          {/* Top-left: Large card (2×2) - System Status */}
          <div
            className="card-large-main"
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('.expand-button')) {
                openModal(<SystemStatusCard devicesStatus={devicesStatus} />);
              }
            }}
          >
            <SystemStatusCard devicesStatus={devicesStatus} />
          </div>

          {/* Top-right row 1: Alerts */}
          <div
            className="card-top-right-1"
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('.expand-button')) {
                openModal(<AlertsCard alerts={alerts} />);
              }
            }}
          >
            <AlertsCard alerts={alerts} />
          </div>

          {/* Top-right row 2: Temperature */}
          <div
            className="card-top-right-2"
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('.expand-button')) {
                openModal(<TemperatureCard temperatureData={temperatureData} />);
              }
            }}
          >
            <TemperatureCard temperatureData={temperatureData} />
          </div>

          {/* Row 3: 4 cards */}
          <div
            className="card-row3-1"
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('.expand-button')) {
                openModal(<GasReadingsCard gasReadings={gasReadings} />);
              }
            }}
          >
            <GasReadingsCard gasReadings={gasReadings} />
          </div>

          <div
            className="card-row3-2"
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('.expand-button')) {
                openModal(<DoorsWindowsCard doorsWindows={doorsWindows} />);
              }
            }}
          >
            <DoorsWindowsCard doorsWindows={doorsWindows} />
          </div>

          <div
            className="card-row3-3"
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('.expand-button')) {
                openModal(<DoorbellControlCard doorbellControl={doorbellControl} />);
              }
            }}
          >
            <DoorbellControlCard doorbellControl={doorbellControl} />
          </div>

          <div
            className="card-row3-4"
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('.expand-button')) {
                openModal(<SecurityCard securityDevices={securityDevices} />);
              }
            }}
          >
            <SecurityCard securityDevices={securityDevices} />
          </div>
        </div>

        {/* Modal Overlay */}
        {modalCard && (
          <div className="modal-overlay" onClick={closeModal}>
            <button className="modal-close" onClick={closeModal}>
              ✕
            </button>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              {modalCard}
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
