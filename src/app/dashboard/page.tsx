'use client';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <div style={{ padding: '20px' }}>
        <h1>Dashboard</h1>
        <p>Welcome to ESP32 Smart Home!</p>
      </div>
    </ProtectedRoute>
  );
}
