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

// Helper to get auth token from localStorage
const getAuthToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
};

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Backend device interface
interface BackendDevice {
  device_id: string;
  type: string;
  name: string;
  online: boolean; // Computed by backend from expireAt
  last_seen: string | null;
  uptime_ms: number;
  free_heap: number;
  wifi_rssi: number;
  ip_address: string | null;
  expireAt: any; // Firebase Timestamp - used by backend to compute online status
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
    const response = await axios.get<BackendDevicesResponse>(
      `${API_URL}/api/v1/devices/status/all`,
      { headers: getAuthHeaders() }
    );

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
      {
        timeout: 10000,  // 10 second timeout
        headers: getAuthHeaders()
      }
    );
    return response.data.data;
  } catch (error) {
    console.error('Error fetching doorbell info:', error);
    return null;
  }
}

// Camera control functions using new backend endpoints
export async function startCamera(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/camera/start`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error starting camera:', error);
    throw error;
  }
}

export async function stopCamera(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/camera/stop`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error stopping camera:', error);
    throw error;
  }
}

export async function restartCamera(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/camera/restart`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error restarting camera:', error);
    throw error;
  }
}

// Microphone control functions
export async function startMicrophone(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/mic/start`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error starting microphone:', error);
    throw error;
  }
}

export async function stopMicrophone(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/mic/stop`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error stopping microphone:', error);
    throw error;
  }
}

export async function getMicrophoneStatus(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/mic/status`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error getting microphone status:', error);
    throw error;
  }
}

// Audio amplifier control functions
export async function playAmplifier(deviceId: string, url: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/amp/play?url=${encodeURIComponent(url)}`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error playing amplifier:', error);
    throw error;
  }
}

export async function stopAmplifier(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/amp/stop`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error stopping amplifier:', error);
    throw error;
  }
}

export async function restartAmplifier(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/amp/restart`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error restarting amplifier:', error);
    throw error;
  }
}

export async function setAmplifierVolume(deviceId: string, level: number) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/amp/volume?level=${level}`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error setting amplifier volume:', error);
    throw error;
  }
}

export async function getAmplifierStatus(deviceId: string) {
  try {
    const response = await axios.get(
      `${API_URL}/api/v1/devices/${deviceId}/amp/status`,
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error getting amplifier status:', error);
    throw error;
  }
}

export async function listAmplifierFiles(deviceId: string) {
  try {
    const response = await axios.get(
      `${API_URL}/api/v1/devices/${deviceId}/amp/files`,
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error listing amplifier files:', error);
    throw error;
  }
}

export async function setAmplifierWifi(deviceId: string, ssid: string, password: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/amp/wifi`,
      { ssid, password },
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error setting amplifier WiFi:', error);
    throw error;
  }
}

// Face management functions
export async function getFaceCount(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/face/count`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error getting face count:', error);
    throw error;
  }
}

export async function listFaces(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/face/list`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error listing faces:', error);
    throw error;
  }
}

export async function checkFaceDatabase(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/face/check`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error checking face database:', error);
    throw error;
  }
}

// System control functions
export async function restartSystem(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/system/restart`,
      {},
      {
        timeout: 15000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error restarting system:', error);
    throw error;
  }
}

// Get device info (combines live_status data)
export async function getDeviceInfo(deviceId: string) {
  try {
    const response = await axios.get(
      `${API_URL}/api/v1/devices/${deviceId}/info`,
      {
        timeout: 10000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error getting device info:', error);
    throw error;
  }
}

// Get device history (face detections, doorbell rings, etc.)
export async function getDeviceHistory(deviceId: string, limit: number = 20) {
  try {
    const response = await axios.get(
      `${API_URL}/api/v1/devices/${deviceId}/history?limit=${limit}`,
      {
        timeout: 10000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error getting device history:', error);
    return { events: [] }; // Return empty events on error
  }
}

// Legacy function for backward compatibility
export async function controlDoorbell(
  deviceId: string,
  action: 'camera_start' | 'camera_stop' | 'mic_start' | 'mic_stop' | 'ping'
) {
  // Use new endpoints based on action
  switch (action) {
    case 'camera_start':
      return startCamera(deviceId);
    case 'camera_stop':
      return stopCamera(deviceId);
    case 'mic_start':
      return startMicrophone(deviceId);
    case 'mic_stop':
      return stopMicrophone(deviceId);
    default:
      throw new Error(`Unsupported action: ${action}`);
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

// Helper function to get device status class for styling
export function getDeviceStatusClass(online: boolean, lastSeen: string | null): string {
  // Backend provides online boolean
  if (online) return 'status-online';

  // If offline, check how long ago it was last seen
  if (!lastSeen) return 'status-offline';

  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / 60000;

  if (diffMinutes < 5) return 'status-warning';
  return 'status-offline';
}

// Helper function to get human-readable device status text
export function getDeviceStatusText(online: boolean, lastSeen: string | null): string {
  // Backend provides online boolean
  if (online) return 'ONLINE';

  // If offline, show how long ago it was last seen
  if (!lastSeen) return 'OFFLINE';

  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - lastSeenDate.getTime()) / 60000);

  if (diffMinutes < 5) return `LAST SEEN ${diffMinutes}M AGO`;
  return 'OFFLINE';
}
