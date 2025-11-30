import axios from 'axios';
import { getCookie } from '@/utils/cookies';
import type {
  DevicesStatus,
  Alert,
  TemperatureData,
  GasReading,
  DoorWindow,
  DoorbellControl,
  SecurityDevice,
  SensorReading,
  SensorData,
  HubSensorData,
  BackendDevice
} from '@/types/dashboard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Helper to get auth token from cookies
const getAuthToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return getCookie('auth_token');
  }
  return null;
};

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const validActions = [
  'camera_start',
  'camera_stop',
  'camera_restart',
  'mic_start',
  'mic_stop',
  'mic_status',
  'recording_start',
  'recording_stop',
  'start_preview',
  'recognize_face',
  'reboot',
  'update_config',
  'amp_play',
  'amp_stop',
  'amp_restart',
  'amp_volume',
  'amp_status',
  'amp_list',
  'amp_wifi',
  'system_restart',
];

// Backend devices response interface
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
      status: response.data.status,
      timestamp: response.data.timestamp,
      summary: response.data.summary,
      devices: response.data.devices
    };
  } catch (error) {
    console.error('Error fetching devices:', error);
    // Return empty structure on error to prevent frontend crashes
    return {
      status: 'error',
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
  const rooms = ['Hub', 'Living Room', 'Bedroom', 'Kitchen'];
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
  // Renamed to Sensor 1, Sensor 2, Sensor 3 (removed specific location names)
  const sensorCount = 3;
  const now = Date.now();

  return Array.from({ length: sensorCount }, (_, idx) => {
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
      location: `Sensor ${idx + 1}`,
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

// Face database info types
export interface FaceInfo {
  id: number;
  name: string;
}

export interface FaceDatabaseInfo {
  type: string;
  count: number;
  faces: FaceInfo[];
  db_status: string;
  db_message: string;
  last_updated: any;
}

interface BackendFaceDatabaseInfoResponse {
  status: string;
  device_id: string;
  face_database: FaceDatabaseInfo | null;
  message?: string;
}

// Get doorbell device info via backend proxy
export async function getDoorbellInfo(deviceId: string): Promise<DoorbellInfo | null> {
  try {
    const response = await axios.get<BackendDoorbellInfoResponse>(
      `${API_URL}/api/v1/devices/doorbell/${deviceId}/status`,
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


/**
* Sends a generic command to a device using the unified command endpoint.
*
* @param deviceId The ID of the device to send the command to.
* @param action The specific action to be performed (e.g., 'camera_start', 'mic_stop').
* @param params Optional parameters for the command.
* @returns The response data from the backend.
* @throws Error if the command fails.
*/
export async function sendCommand(deviceId: string, action: string, params: any = {}) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/command`,
      { action, params },
      {
        timeout: 15000, // Or whatever default timeout is appropriate
        headers: getAuthHeaders() // Assuming this function exists and provides auth headers
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error sending command '${action}' to device '${deviceId}':`, error);
    throw error;
  }
}

// Get face database info (current status from backend)
export async function getFaceDatabaseInfo(deviceId: string): Promise<FaceDatabaseInfo | null> {
  try {
    const response = await axios.get<BackendFaceDatabaseInfoResponse>(
      `${API_URL}/api/v1/devices/${deviceId}/face-database/info`,
      {
        timeout: 10000,
        headers: getAuthHeaders()
      }
    );

    if (response.data.status === 'ok') {
      return response.data.face_database;
    }
    return null;
  } catch (error) {
    console.error('Error fetching face database info:', error);
    return null;
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

// Backend response interface for device status
interface BackendDeviceStatusResponse {
  status: string;
  device_id: string;
  data: {
    camera_active?: boolean;
    mic_active?: boolean;
    ip_address?: string;
    wifi_rssi?: number;
    last_updated?: {
      _seconds: number;
      _nanoseconds: number;
    };
    uptime_ms?: number;
    free_heap?: number;
  };
}

// Get real doorbell control status via backend
export async function getDoorbellControlStatus(deviceId: string): Promise<DoorbellControl> {
  try {
    // Use the correct backend endpoint that returns device state
    const response = await axios.get<BackendDeviceStatusResponse>(
      `${API_URL}/api/v1/devices/doorbell/${deviceId}/status`,
      {
        timeout: 10000,
        headers: getAuthHeaders()
      }
    );

    console.log('Doorbell status response:', response.data); // Debug log

    if (response.data && response.data.status === 'ok' && response.data.data) {
      const data = response.data.data;

      console.log('Camera active from backend:', data.camera_active); // Debug log

      // Transform backend response to DoorbellControl format
      return {
        camera_active: data.camera_active || false,
        mic_active: data.mic_active || false,
        face_recognition: false, // Not provided by backend yet
        last_activity: data.last_updated
          ? new Date(data.last_updated._seconds * 1000).toISOString()
          : new Date().toISOString(),
        visitor_count_today: 0  // Not provided by backend yet
      };
    }

    console.warn('Invalid response format from backend'); // Debug log
    // Return default offline state if response is invalid
    return {
      camera_active: false,
      mic_active: false,
      face_recognition: false,
      last_activity: new Date().toISOString(),
      visitor_count_today: 0
    };
  } catch (error) {
    console.error('Error getting doorbell control status:', error);
    // Return default offline state on error
    return {
      camera_active: false,
      mic_active: false,
      face_recognition: false,
      last_activity: new Date().toISOString(),
      visitor_count_today: 0
    };
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
export function getDeviceStatusClass(online: boolean, lastSeen: string | null, deviceType?: string): string {
  // Backend provides online boolean
  if (online) return 'status-online';

  // If offline, check how long ago it was last seen
  if (!lastSeen) return 'status-offline';

  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / 60000;

  // Sensor-type devices poll every 10 minutes, so allow 20 minute window
  const warningThreshold = (deviceType === 'sensor' || deviceType === 'gas_sensor') ? 20 : 5;

  if (diffMinutes < warningThreshold) return 'status-warning';
  return 'status-offline';
}

// Helper function to get human-readable device status text
export function getDeviceStatusText(online: boolean, lastSeen: string | null, deviceType?: string): string {
  // Backend provides online boolean
  if (online) return 'ONLINE';

  // If offline, show how long ago it was last seen
  if (!lastSeen) return 'OFFLINE';

  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - lastSeenDate.getTime()) / 60000);

  // Sensor-type devices poll every 10 minutes, so allow 20 minute window
  const warningThreshold = (deviceType === 'sensor' || deviceType === 'gas_sensor') ? 20 : 5;

  if (diffMinutes < warningThreshold) return `LAST SEEN ${diffMinutes}M AGO`;
  return 'OFFLINE';
}

// Device history interfaces
export interface HistoryEvent {
  type: 'heartbeat' | 'face_detection' | 'command' | 'device_state' | 'device_log';
  id: string;
  timestamp: any;
  data: any;
}

export interface DeviceHistory {
  status: string;
  device_id: string;
  summary: {
    total: number;
    status_events: number;
    face_detections: number;
    commands: number;
    device_logs: number;
  };
  history: HistoryEvent[];
}

// Get device history (mixed: status, face detections, commands, logs)
export async function getDeviceHistory(deviceId: string, limit: number = 10): Promise<DeviceHistory> {
  try {
    const response = await axios.get<DeviceHistory>(
      `${API_URL}/api/v1/devices/${deviceId}/history?limit=${limit}`,
      {
        timeout: 10000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching device history:', error);
    // Return empty history on error
    return {
      status: 'error',
      device_id: deviceId,
      summary: { total: 0, status_events: 0, face_detections: 0, commands: 0, device_logs: 0 },
      history: []
    };
  }
}

// Get device sensor data
export async function getDeviceSensorData(deviceId: string): Promise<SensorData | null> {
  try {
    const response = await axios.get<any>(
      `${API_URL}/api/v1/devices/${deviceId}/sensors/current`,
      {
        timeout: 10000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching device sensor data:', error);
    return null;
  }
}

// Get hub sensor data (DHT11 + PM2.5)
export async function getHubSensorData(deviceId: string): Promise<HubSensorData | null> {
  try {
    const sensorData = await getDeviceSensorData(deviceId);

    if (!sensorData || !sensorData.sensors) {
      return null;
    }

    const result: HubSensorData = {
      device_id: deviceId,
      timestamp: sensorData.timestamp || new Date().toISOString()
    };

    // Extract DHT11 data (temperature + humidity)
    if (sensorData.sensors.temperature !== undefined || sensorData.sensors.humidity !== undefined) {
      result.dht11 = {
        temperature: sensorData.sensors.temperature || 0,
        humidity: sensorData.sensors.humidity || 0
      };
    }

    // Extract PM2.5 data
    if (sensorData.sensors.pm25 !== undefined) {
      result.pm25 = {
        pm25: sensorData.sensors.pm25,
        pm10: sensorData.sensors.pm10,
        aqi: calculateAQI(sensorData.sensors.pm25)
      };
    }

    return result;
  } catch (error) {
    console.error('Error fetching hub sensor data:', error);
    return null;
  }
}

// Calculate Air Quality Index from PM2.5
function calculateAQI(pm25: number): number {
  // Simple AQI calculation based on PM2.5
  // 0-50: Good, 51-100: Moderate, 101-150: Unhealthy for Sensitive, 151-200: Unhealthy, 201+: Very Unhealthy
  if (pm25 <= 12.0) return Math.round((50 / 12.0) * pm25);
  if (pm25 <= 35.4) return Math.round(50 + ((100 - 50) / (35.4 - 12.1)) * (pm25 - 12.1));
  if (pm25 <= 55.4) return Math.round(100 + ((150 - 100) / (55.4 - 35.5)) * (pm25 - 35.5));
  if (pm25 <= 150.4) return Math.round(150 + ((200 - 150) / (150.4 - 55.5)) * (pm25 - 55.5));
  return Math.round(200 + ((300 - 200) / (250.4 - 150.5)) * Math.min(pm25 - 150.5, 99.9));
}

// Get AQI category and color
export function getAQICategory(aqi: number): { category: string; color: string; status: string } {
  if (aqi <= 50) return { category: 'Good', color: 'var(--success)', status: 'status-online' };
  if (aqi <= 100) return { category: 'Moderate', color: 'var(--warning)', status: 'status-warning' };
  if (aqi <= 150) return { category: 'Unhealthy for Sensitive Groups', color: '#FF9800', status: 'status-warning' };
  if (aqi <= 200) return { category: 'Unhealthy', color: 'var(--danger)', status: 'status-offline' };
  if (aqi <= 300) return { category: 'Very Unhealthy', color: '#9C27B0', status: 'status-offline' };
  return { category: 'Hazardous', color: '#880E4F', status: 'status-offline' };
}

// Visitor interface
export interface Visitor {
  id: string;
  name: string;
  image: string | null;
  recognized: boolean;
  confidence: number;
  timestamp: any;
  detected_at: any;
}

export interface LatestVisitorsResponse {
  status: string;
  device_id: string;
  count: number;
  visitors: Visitor[];
}

// Get latest visitors (face detections) with images
export async function getLatestVisitors(deviceId: string, limit: number = 20): Promise<LatestVisitorsResponse> {
  try {
    const response = await axios.get<LatestVisitorsResponse>(
      `${API_URL}/api/v1/devices/${deviceId}/visitors/latest?limit=${limit}`,
      {
        timeout: 10000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching latest visitors:', error);
    // Return empty response on error
    return {
      status: 'error',
      device_id: deviceId,
      count: 0,
      visitors: []
    };
  }
}

// ============================================================================
// Hub-Specific API Calls
// ============================================================================

// Hub sensor data interface
export interface HubSensorResponse {
  status: string;
  device_id: string;
  sensors: {
    temperature: number | null;
    humidity: number | null;
    pm25: number | null;
    aqi: number | null;
    timestamp: any;
    device_id: string;
  };
}

// Get Hub sensor data (DHT11 + PM2.5)
export async function getHubSensors(deviceId: string): Promise<HubSensorResponse | null> {
  try {
    const response = await axios.get<HubSensorResponse>(
      `${API_URL}/api/v1/devices/${deviceId}/hub/sensors`,
      {
        timeout: 5000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching Hub sensors:', error);
    return null;
  }
}

// Device sensor data interface (for non-hub devices)
export interface DeviceSensorResponse {
  status: string;
  device_id: string;
  sensors: {
    temperature: number | null;
    humidity: number | null;
    timestamp: any;
    device_id: string;
  };
}

// Get individual device sensor data
export async function getDeviceSensors(deviceId: string): Promise<DeviceSensorResponse | null> {
  try {
    const response = await axios.get<DeviceSensorResponse>(
      `${API_URL}/api/v1/devices/${deviceId}/sensor/sensors`,
      {
        timeout: 5000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching sensors for device ${deviceId}:`, error);
    return null;
  }
}

// Historical sensor reading interface
export interface HistoricalSensorReading {
  id: string;
  timestamp: {
    _seconds: number;
    _nanoseconds: number;
  };
  temperature: number;
  humidity: number;
  light_lux?: number;
  gas_level?: number;
  battery_voltage?: number;
  battery_percent?: number;
  averaged?: boolean;
  sample_count?: number;
  boot_count?: number;
  created_at: string;
}

export interface SensorReadingsResponse {
  status: string;
  device_id: string;
  start: string;
  end: string;
  hours: number;
  count: number;
  interval_minutes: number;
  readings: HistoricalSensorReading[];
}

// Get sensor readings history for charts (works for both hub and sensors)
export async function getSensorReadings(deviceId: string, hours: number = 24): Promise<SensorReadingsResponse | null> {
  try {
    const response = await axios.get<SensorReadingsResponse>(
      `${API_URL}/api/v1/devices/${deviceId}/sensors/readings`,
      {
        params: { hours },
        timeout: 10000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching sensor readings for device ${deviceId}:`, error);
    return null;
  }
}

// Hub alert interface
export interface HubAlertParams {
  message: string;
  level?: 'info' | 'warning' | 'error' | 'critical';
  duration?: number; // seconds, 1-300
}

export interface HubAlertResponse {
  status: string;
  message: string;
  command_id: string;
  alert: {
    message: string;
    level: string;
    duration: number;
  };
}

// Send alert to Hub LCD display
export async function sendHubAlert(deviceId: string, params: HubAlertParams): Promise<HubAlertResponse | null> {
  try {
    const response = await axios.post<HubAlertResponse>(
      `${API_URL}/api/v1/devices/${deviceId}/hub/alert`,
      {
        message: params.message,
        level: params.level || 'info',
        duration: params.duration || 10
      },
      {
        timeout: 5000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending Hub alert:', error);
    return null;
  }
}

// Hub amplifier streaming status interface
export interface HubAmpStreamingResponse {
  status: string;
  device_id: string;
  amplifier: {
    is_streaming: boolean;
    current_url: string | null;
    volume_level: number;
    is_playing: boolean;
    timestamp: any;
    device_id: string;
  };
}

// Get Hub amplifier streaming status
export async function getHubAmpStreaming(deviceId: string): Promise<HubAmpStreamingResponse | null> {
  try {
    const response = await axios.get<HubAmpStreamingResponse>(
      `${API_URL}/api/v1/devices/${deviceId}/hub/amp/streaming`,
      {
        timeout: 5000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching Hub amp streaming status:', error);
    return null;
  }
}

// Hub amplifier play
export async function playHubAmplifier(deviceId: string, url: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/amp/play`,
      {},
      {
        timeout: 5000,
        headers: getAuthHeaders(),
        params: { url }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error playing Hub amplifier:', error);
    throw error;
  }
}

// Hub amplifier stop
export async function stopHubAmplifier(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/amp/stop`,
      {},
      {
        timeout: 5000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error stopping Hub amplifier:', error);
    throw error;
  }
}

// Hub amplifier restart
export async function restartHubAmplifier(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/amp/restart`,
      {},
      {
        timeout: 5000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error restarting Hub amplifier:', error);
    throw error;
  }
}

// Hub amplifier set volume
export async function setHubAmplifierVolume(deviceId: string, level: number) {
  try {
    if (level < 0 || level > 21) {
      throw new Error('Volume level must be between 0 and 21');
    }
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/amp/volume`,
      {},
      {
        timeout: 5000,
        headers: getAuthHeaders(),
        params: { level }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error setting Hub amplifier volume:', error);
    throw error;
  }
}

// Hub amplifier get status
export async function getHubAmplifierStatus(deviceId: string) {
  try {
    const response = await axios.get(
      `${API_URL}/api/v1/devices/${deviceId}/amp/status`,
      {
        timeout: 5000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error getting Hub amplifier status:', error);
    throw error;
  }
}

// Hub system restart
export async function restartHubSystem(deviceId: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/v1/devices/${deviceId}/system/restart`,
      {},
      {
        timeout: 5000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error restarting Hub system:', error);
    throw error;
  }
}

// ============================================================================
// GAS SENSOR API CALLS (Using Your Existing Backend Structure)
// ============================================================================

// Interface for sensor current data
interface SensorCurrentResponse {
  status: string;
  device_id: string;
  sensors: {
    forwarded_by?: string;
    alert?: boolean;
    device_type?: string;
    averaged?: boolean;
    sample_count?: number;
    battery_percent?: number;
    boot_count?: number;
    battery_voltage?: number;
    last_updated?: string;
    light_lux?: number;
    temperature?: number;
    humidity?: number;
    gas_level?: number;
    timestamp?: string;
  };
}

// Get current sensor data for a device
export async function getCurrentSensorData(deviceId: string): Promise<SensorCurrentResponse | null> {
  try {
    const response = await axios.get<SensorCurrentResponse>(
      `${API_URL}/api/v1/devices/${deviceId}/sensor/sensors`,
      {
        timeout: 5000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching current sensor data for ${deviceId}:`, error);
    return null;
  }
}

// Get sensor readings history
export async function getSensorReadingsHistory(deviceId: string, hours: number = 24): Promise<SensorReadingsResponse | null> {
  try {
    const response = await axios.get<SensorReadingsResponse>(
      `${API_URL}/api/v1/devices/${deviceId}/sensors/readings`,
      {
        params: { hours },
        timeout: 10000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching sensor readings for ${deviceId}:`, error);
    return null;
  }
}

// Transform backend data to GasReading format for the dashboard
export async function getGasReadingsForDashboard(): Promise<GasReading[]> {
  try {
    console.log('Fetching gas sensor data from backend...');

    // Get all devices
    const devicesResponse = await getAllDevices();
    const devices = devicesResponse.devices;

    console.log('All devices:', devices);

    // Filter devices that might have gas sensors (sensors or hub)
    const sensorDevices = devices.filter(device =>
      device.type === 'sensor' ||
      device.type === 'gas_sensor' ||
      device.type === 'hub' ||
      device.type === 'main_lcd'
    );

    console.log('Filtered sensor devices:', sensorDevices);

    if (sensorDevices.length === 0) {
      console.log('No sensor devices found, using mock data');
      return generateMockGasReadings();
    }

    // Fetch gas sensor data from each device
    const gasReadings: GasReading[] = [];

    for (const device of sensorDevices) {
      try {
        // Get current sensor data
        const currentData = await getCurrentSensorData(device.device_id);

        if (!currentData || !currentData.sensors) {
          console.log(`No sensor data for ${device.device_id}`);
          continue;
        }

        // Check if device has gas_level data
        if (currentData.sensors.gas_level === undefined && currentData.sensors.gas_level === null) {
          console.log(`Device ${device.device_id} has no gas_level data`);
          continue;
        }

        console.log(`Found gas sensor data for ${device.device_id}:`, currentData.sensors);

        // Get historical data
        const historyData = await getSensorReadingsHistory(device.device_id, 24);

        // Transform history to SensorReading format
        const history: SensorReading[] = historyData?.readings?.map(reading => ({
          timestamp: new Date(reading.timestamp._seconds * 1000).toISOString(),
          value: reading.gas_level || 0
        })) || [];

        // If no history, use current reading
        if (history.length === 0) {
          history.push({
            timestamp: new Date().toISOString(),
            value: currentData.sensors.gas_level || 0
          });
        }

        // Calculate status based on gas level
        const gasLevel = currentData.sensors.gas_level || 0;
        let status: 'safe' | 'warning' | 'danger' = 'safe';
        if (gasLevel > 150) status = 'danger';
        else if (gasLevel > 100) status = 'warning';

        // Remove "homehub" from location name and rename to "Sensor X"
        let locationName = device.name || device.device_id;

        // Remove "homehub" (case-insensitive)
        locationName = locationName.replace(/homehub/gi, '').trim();

        // Generate sensor number based on array index
        const sensorNumber = gasReadings.length + 1;
        locationName = `Sensor ${sensorNumber}`;

        gasReadings.push({
          sensor_id: device.device_id,
          location: locationName,
          ppm: gasLevel,
          status,
          history
        });

      } catch (error) {
        console.error(`Error processing device ${device.device_id}:`, error);
        continue;
      }
    }

    console.log('Final gas readings:', gasReadings);

    // If no gas sensors found with data, return mock data
    if (gasReadings.length === 0) {
      console.log('No gas sensor data found, using mock data');
      return generateMockGasReadings();
    }

    return gasReadings;

  } catch (error) {
    console.error('Error fetching gas readings for dashboard:', error);
    return generateMockGasReadings();
  }
}

// ============================================================================
// Device Management Functions
// ============================================================================

// Register a new device
export interface RegisterDeviceParams {
  device_id: string;
  device_type: string;
  name?: string;
}

export interface RegisterDeviceResponse {
  status: string;
  message: string;
  device_id: string;
  api_token: string;
  warning: string;
}

export async function registerDevice(params: RegisterDeviceParams): Promise<RegisterDeviceResponse> {
  try {
    const response = await axios.post<RegisterDeviceResponse>(
      `${API_URL}/api/v1/devices/register`,
      params,
      {
        timeout: 10000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Error registering device:', error);
    throw new Error(error.response?.data?.message || 'Failed to register device');
  }
}

// Delete a device
export interface DeleteDeviceResponse {
  status: string;
  message: string;
  device_id: string;
}

export async function deleteDevice(deviceId: string): Promise<DeleteDeviceResponse> {
  try {
    const response = await axios.delete<DeleteDeviceResponse>(
      `${API_URL}/api/v1/devices/${deviceId}`,
      {
        timeout: 10000,
        headers: getAuthHeaders()
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Error deleting device:', error);
    throw new Error(error.response?.data?.message || 'Failed to delete device');
  }
}
