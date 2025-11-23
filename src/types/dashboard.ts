// Dashboard Types

export interface Device {
  device_id: string;
  type: string;
  name: string;
  online: boolean; // Computed by backend from expireAt
  last_seen: string | null;
  uptime_ms: number;
  free_heap: number;
  wifi_rssi: number;
  ip_address: string | null;
  battery?: number; // Battery percentage (0-100)
  expireAt: any; // Firebase Timestamp - used by backend to compute online status
}

// Backend device type alias (same as Device)
export type BackendDevice = Device;

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

// Sensor data from Backend API
export interface SensorData {
  device_id: string;
  sensors: {
    temperature?: number;
    humidity?: number;
    pm25?: number;
    pm10?: number;
    co2?: number;
    motion?: boolean;
    [key: string]: any;
  };
  timestamp?: string;
}

// Hub sensor data with multiple sensors
export interface HubSensorData {
  device_id: string;
  dht11?: {
    temperature: number;
    humidity: number;
  };
  pm25?: {
    pm25: number;
    pm10?: number;
    aqi?: number; // Air Quality Index
  };
  timestamp: string;
}
