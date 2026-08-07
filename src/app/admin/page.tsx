'use client';

import React, { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import GlassBar from '@/components/glass/GlassBar';
import { PageSkeleton } from '@/components/glass/Skeleton';
import { AdminManagementCard } from '@/components/dashboard/AdminManagementCard';
import { getAllDevices } from '@/services/devices.service';
import type { DevicesStatus } from '@/types/dashboard';
import { relativeTime } from '@/utils/time';

/**
 * Admin — mockups/glass/admin.html as a real route.
 *
 * The mockup was designed as a full page (two tables, three forms, a
 * destructive confirm). It shipped as a dashboard modal instead, which
 * meant a 450-line management surface inside a dialog: no URL to link a
 * teammate to, no back button, and tables scrolling inside a box.
 *
 * requireAdmin does the gate. It renders the "you don't have access"
 * state rather than bouncing to /dashboard, so a non-admin who follows a
 * link learns why nothing happened.
 */

export default function AdminPage() {
  const [devicesStatus, setDevicesStatus] = useState<DevicesStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setDevicesStatus(await getAllDevices());
      } catch (error) {
        console.error('Error loading devices:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
    // Slower than the dashboard's 5s: this page is edited, not watched,
    // and a table reshuffling under the cursor mid-click is worse than
    // a stale row.
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const devices = devicesStatus?.devices ?? [];
  const offline = devicesStatus?.summary.offline ?? 0;
  const online = devicesStatus?.summary.online ?? 0;
  const total = devicesStatus?.summary.total ?? 0;
  const sensorCount = devices.filter(d => d.type === 'sensor').length;

  /* The freshest last_seen across every board. "Last sync" in the mockup was
     a clock time; a relative one survives the page being left open. */
  const lastSeen = devices.length
    ? relativeTime(
        devices
          .map(d => (d.last_seen ? new Date(d.last_seen).getTime() : 0))
          .reduce((a, b) => Math.max(a, b), 0) || null,
      )
    : 'never';

  /* ProtectedRoute goes outside the loading branch, not inside it. With the
     branch first, a signed-out visitor got the page's own "Loading people
     and enrolled boards" spinner — the shell of a page they are not allowed
     to see — before the gate ever ran. */
  if (loading) {
    return (
      <ProtectedRoute requireAdmin>
        <PageSkeleton label="Loading people and enrolled boards." variant="admin" />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireAdmin>
      <main className="g-page">
        <GlassBar />

        <div className="g-title">
          <h1>Devices &amp; admin</h1>
          <p>Pair boards, rename installed hardware, and manage who can open the home.</p>
        </div>

        {/* The stat strip from admin.html. Reading a table to find out how
            many boards are offline is work the page should have done. */}
        <div className="g-grid g-grid--4">
          <div className="g-pane g-card">
            <p className="g-label">Devices online</p>
            <div className="g-metric-sm g-num">{online}<small>of {total}</small></div>
          </div>
          <div className={`g-pane g-card ${offline ? 'is-warn' : ''}`}>
            <p className="g-label">Not reporting</p>
            <div className="g-metric-sm g-num">{offline}<small>{offline === 1 ? 'device' : 'devices'}</small></div>
          </div>
          <div className="g-pane g-card">
            <p className="g-label">Sensors</p>
            <div className="g-metric-sm g-num">{sensorCount}<small>enrolled</small></div>
          </div>
          <div className="g-pane g-card">
            <p className="g-label">Last heard from</p>
            {/* A date is a word, not a metric — see .g-metric-word. */}
            <div className="g-metric-word">{lastSeen}</div>
          </div>
        </div>

        <AdminManagementCard devices={devices} isExpanded hideHeader sectioned />
      </main>
    </ProtectedRoute>
  );
}
