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

// Get all devices status from backend
export async function getAllDevices(): Promise<DevicesStatus> {
  try {
    const response = await axios.get(`${API_URL}/api/v1/devices/status/all`);
    return response.data;
  } catch (error) {
    console.error('Error fetching devices:', error);
    throw error;
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

// Doorbell control actions
export async function controlDoorbell(action: 'camera_start' | 'camera_stop' | 'mic_start' | 'mic_stop') {
  // This would call your doorbell's HTTP endpoints
  const DOORBELL_URL = 'http://doorbell.local';

  const endpoints = {
    camera_start: '/camera/start',
    camera_stop: '/camera/stop',
    mic_start: '/mic/start',
    mic_stop: '/mic/stop'
  };

  try {
    const response = await axios.get(`${DOORBELL_URL}${endpoints[action]}`);
    return response.data;
  } catch (error) {
    console.error(`Error controlling doorbell (${action}):`, error);
    throw error;
  }
}
