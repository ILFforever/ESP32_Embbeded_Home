// Dashboard Types

export interface Device {
  device_id: string;
  type: string;
  name: string;
  online: boolean;
  last_seen: string | null;
  uptime_ms: number;
  free_heap: number;
  wifi_rssi: number;
  ip_address: string | null;
}

export interface DevicesStatus {
  status: string;
  timestamp: string;
  summary: {
    total: number;
    online: number;
    offline: number;
  };
  devices: Device[];
}

export interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  device_id?: string;
  acknowledged: boolean;
}

export interface SensorReading {
  timestamp: string;
  value: number;
}

export interface TemperatureData {
  room: string;
  current: number;
  history: SensorReading[];
  humidity?: number;
}

export interface GasReading {
  sensor_id: string;
  location: string;
  ppm: number;
  status: 'safe' | 'warning' | 'danger';
  history: SensorReading[];
}

export interface DoorWindow {
  id: string;
  name: string;
  location: string;
  type: 'door' | 'window';
  status: 'open' | 'closed' | 'locked' | 'unlocked';
  last_changed: string;
  battery?: number;
}

export interface DoorbellControl {
  camera_active: boolean;
  mic_active: boolean;
  face_recognition: boolean;
  last_activity: string | null;
  visitor_count_today: number;
}

export interface SecurityDevice {
  id: string;
  name: string;
  type: 'lock' | 'alarm' | 'camera';
  status: 'armed' | 'disarmed' | 'triggered' | 'locked' | 'unlocked';
  location: string;
  battery?: number;
}

export interface Rule {
  id: string;
  name: string;
  condition: string;
  action: string;
  enabled: boolean;
  created_by: string;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  created_at: string;
  last_login: string | null;
}

export interface SensorPairing {
  sensor_id: string;
  sensor_type: string;
  room: string;
  paired: boolean;
  last_seen: string | null;
}
