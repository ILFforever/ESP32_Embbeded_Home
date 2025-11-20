import axios from 'axios';
import type {
  DevicesStatus,
  Alert,
  TemperatureData,
  GasReading,
  DoorWindow,
  DoorbellControl,
  SecurityDevice,
  SensorReading
} from '@/types/dashboard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Backend device interface
interface BackendDevice {
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

interface BackendDevicesResponse {
  status: string;
  timestamp: string;
  summary: {
    total: number;
    online: number;
    offline: number;
  };
  devices: BackendDevice[];
}

// Get all devices status from backend
export async function getAllDevices(): Promise<DevicesStatus> {
  try {
    const response = await axios.get<BackendDevicesResponse>(`${API_URL}/api/v1/devices/status/all`);

    // Transform backend data to match frontend DevicesStatus interface
    return {
      timestamp: response.data.timestamp,
      summary: response.data.summary,
      devices: response.data.devices
    };
  } catch (error) {
    console.error('Error fetching devices:', error);
    // Return empty structure on error to prevent frontend crashes
    return {
      timestamp: new Date().toISOString(),
      summary: { total: 0, online: 0, offline: 0 },
      devices: []
    };
  }
}

// Mock data generators (until sensors are integrated)

export function generateMockAlerts(): Alert[] {
  return [
    {
      id: '1',
      type: 'critical',
      title: 'Front Door Unlocked',
      message: 'Front door has been unlocked for 10 minutes',
      timestamp: new Date(Date.now() - 600000).toISOString(),
      device_id: 'door_01',
      acknowledged: false
    },
    {
      id: '2',
      type: 'warning',
      title: 'High Temperature',
      message: 'Living room temperature is 32°C',
      timestamp: new Date(Date.now() - 300000).toISOString(),
      device_id: 'temp_01',
      acknowledged: false
    },
    {
      id: '3',
      type: 'info',
      title: 'Doorbell Activity',
      message: 'Motion detected at front door',
      timestamp: new Date(Date.now() - 120000).toISOString(),
      device_id: 'db_001',
      acknowledged: true
    }
  ];
}

export function generateMockTemperatureData(): TemperatureData[] {
  const rooms = ['Living Room', 'Bedroom', 'Kitchen', 'Bathroom'];
  const now = Date.now();

  return rooms.map((room, idx) => {
    const baseTemp = 22 + idx * 2;
    const history: SensorReading[] = [];

    // Generate 24 hours of data (1 point per hour)
    for (let i = 24; i >= 0; i--) {
      history.push({
        timestamp: new Date(now - i * 3600000).toISOString(),
        value: baseTemp + Math.random() * 4 - 2
      });
    }

    return {
      room,
      current: baseTemp + Math.random() * 4 - 2,
      humidity: 40 + Math.random() * 30,
      history
    };
  });
}

export function generateMockGasReadings(): GasReading[] {
  const locations = ['Kitchen', 'Garage', 'Basement'];
  const now = Date.now();

  return locations.map((location, idx) => {
    const basePPM = 50 + idx * 20;
    const history: SensorReading[] = [];

    // Generate 24 hours of data
    for (let i = 24; i >= 0; i--) {
      history.push({
        timestamp: new Date(now - i * 3600000).toISOString(),
        value: basePPM + Math.random() * 30
      });
    }

    const currentPPM = basePPM + Math.random() * 30;
    let status: 'safe' | 'warning' | 'danger' = 'safe';
    if (currentPPM > 150) status = 'danger';
    else if (currentPPM > 100) status = 'warning';

    return {
      sensor_id: `gas_0${idx + 1}`,
      location,
      ppm: currentPPM,
      status,
      history
    };
  });
}

export function generateMockDoorsWindows(): DoorWindow[] {
  return [
    {
      id: 'door_01',
      name: 'Front Door',
      location: 'Entrance',
      type: 'door',
      status: 'unlocked',
      last_changed: new Date(Date.now() - 600000).toISOString(),
      battery: 85
    },
    {
      id: 'door_02',
      name: 'Back Door',
      location: 'Kitchen',
      type: 'door',
      status: 'locked',
      last_changed: new Date(Date.now() - 7200000).toISOString(),
      battery: 92
    },
    {
      id: 'window_01',
      name: 'Living Room Window',
      location: 'Living Room',
      type: 'window',
      status: 'closed',
      last_changed: new Date(Date.now() - 3600000).toISOString(),
      battery: 78
    },
    {
      id: 'window_02',
      name: 'Bedroom Window',
      location: 'Bedroom',
      type: 'window',
      status: 'open',
      last_changed: new Date(Date.now() - 1800000).toISOString(),
      battery: 88
    }
  ];
}

export function generateMockDoorbellControl(): DoorbellControl {
  return {
    camera_active: false,
    mic_active: false,
    face_recognition: true,
    last_activity: new Date(Date.now() - 120000).toISOString(),
    visitor_count_today: 3
  };
}

export function generateMockSecurityDevices(): SecurityDevice[] {
  return [
    {
      id: 'lock_01',
      name: 'Front Door Lock',
      type: 'lock',
      status: 'unlocked',
      location: 'Front Door',
      battery: 75
    },
    {
      id: 'lock_02',
      name: 'Back Door Lock',
      type: 'lock',
      status: 'locked',
      location: 'Back Door',
      battery: 82
    },
    {
      id: 'alarm_01',
      name: 'Main Alarm',
      type: 'alarm',
      status: 'disarmed',
      location: 'Control Panel'
    },
    {
      id: 'camera_01',
      name: 'Front Camera',
      type: 'camera',
      status: 'armed',
      location: 'Front Door'
    }
  ];
}

// Doorbell info interface from ESP32 (via backend proxy)
interface DoorbellInfo {
  ip: string;
  uptime: number;
  slave_status: number;  // -1=disconnected, 0=standby, 1=active
  amp_status: number;
  free_heap: number;
  ping_count: number;
  wifi_rssi: number;
  wifi_connected: boolean;
}

// Backend response wrapper for doorbell info
interface BackendDoorbellInfoResponse {
  status: string;
  device_id: string;
  data: DoorbellInfo;
}

// Backend response wrapper for doorbell control
interface BackendDoorbellControlResponse {
  status: string;
  device_id: string;
  action: string;
  result: any;
}

// Get doorbell device info via backend proxy
export async function getDoorbellInfo(deviceId: string): Promise<DoorbellInfo | null> {
  try {
    const response = await axios.get<BackendDoorbellInfoResponse>(
      `${API_URL}/api/v1/devices/doorbell/${deviceId}/info`,
      { timeout: 10000 }  // 10 second timeout
    );
    return response.data.data;
  } catch (error) {
    console.error('Error fetching doorbell info:', error);
    return null;
  }
}

// Doorbell control actions via backend proxy
export async function controlDoorbell(
  deviceId: string,
  action: 'camera_start' | 'camera_stop' | 'mic_start' | 'mic_stop' | 'ping'
) {
  try {
    const response = await axios.post<BackendDoorbellControlResponse>(
      `${API_URL}/api/v1/devices/doorbell/${deviceId}/control`,
      { action },
      { timeout: 15000 }  // 15 second timeout for commands
    );
    return response.data.result;
  } catch (error) {
    console.error(`Error controlling doorbell (${action}):`, error);
    throw error;
  }
}

// Get real doorbell control status via backend
export async function getDoorbellControlStatus(deviceId: string): Promise<DoorbellControl> {
  try {
    const info = await getDoorbellInfo(deviceId);

    if (!info) {
      // Return default offline state
      return {
        camera_active: false,
        mic_active: false,
        face_recognition: false,
        last_activity: new Date().toISOString(),
        visitor_count_today: 0
      };
    }

    // Transform ESP32 status to DoorbellControl format
    return {
      camera_active: info.slave_status === 1,  // 1 = active
      mic_active: false,  // Would need to query mic status
      face_recognition: info.slave_status >= 0,  // >= 0 = connected
      last_activity: new Date().toISOString(),
      visitor_count_today: 0  // Would need to track this in backend
    };
  } catch (error) {
    console.error('Error getting doorbell control status:', error);
    return generateMockDoorbellControl();
  }
}

// Helper function to find doorbell device from devices list
export function findDoorbellDevice(devices: BackendDevice[]): BackendDevice | null {
  return devices.find(device => device.type === 'doorbell') || null;
}

// Helper function to find hub device from devices list
export function findHubDevice(devices: BackendDevice[]): BackendDevice | null {
  return devices.find(device => device.type === 'hub' || device.type === 'main_lcd') || null;
}

// Helper function to check if a device is online based on last_seen timestamp
export function isDeviceOnline(lastSeen: string | null, thresholdMinutes: number = 2): boolean {
  if (!lastSeen) return false;

  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / 60000;

  return diffMinutes < thresholdMinutes;
}

// Helper function to get device status class for styling
export function getDeviceStatusClass(lastSeen: string | null): string {
  if (!lastSeen) return 'status-offline';

  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / 60000;

  if (diffMinutes < 2) return 'status-online';
  if (diffMinutes < 5) return 'status-warning';
  return 'status-offline';
}

// Helper function to get human-readable device status text
export function getDeviceStatusText(lastSeen: string | null): string {
  if (!lastSeen) return 'OFFLINE';

  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - lastSeenDate.getTime()) / 60000);

  if (diffMinutes < 2) return 'ONLINE';
  if (diffMinutes < 5) return `LAST SEEN ${diffMinutes}M AGO`;
  return 'OFFLINE';
}

// Device history interfaces
export interface HistoryEvent {
  type: 'heartbeat' | 'face_detection' | 'command';
  id: string;
  timestamp: any;
  data: any;
}

export interface DeviceHistory {
  status: string;
  device_id: string;
  summary: {
    total: number;
    heartbeats: number;
    face_detections: number;
    commands: number;
  };
  history: HistoryEvent[];
}

// Get device history (mixed: heartbeats, face detections, commands)
export async function getDeviceHistory(deviceId: string, limit: number = 20): Promise<DeviceHistory> {
  try {
    const response = await axios.get<DeviceHistory>(
      `${API_URL}/api/v1/devices/${deviceId}/history?limit=${limit}`
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching device history:', error);
    throw error;
  }
}
