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
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

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
        <header className="dashboard-header">
          <h1>SMART HOME CONTROL SYSTEM</h1>
          <div className="header-info">
            <span className="status-dot status-online"></span>
            <span>ALL SYSTEMS OPERATIONAL</span>
          </div>
        </header>

        <div className="dashboard-grid">
          {/* Large main card on top */}
          <div className="main-card-container">
            <SystemStatusCard devicesStatus={devicesStatus} />
          </div>

          {/* Smaller cards on the side */}
          <div className="side-cards-container">
            <AlertsCard alerts={alerts} />
            <TemperatureCard temperatureData={temperatureData} />
            <GasReadingsCard gasReadings={gasReadings} />
            <DoorsWindowsCard doorsWindows={doorsWindows} />
            <DoorbellControlCard doorbellControl={doorbellControl} />
            <SecurityCard securityDevices={securityDevices} />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
