// Auth Types
export interface AuthResponse {
  success: boolean;
  token?: string;
  message?: string;
}

export interface UserData {
  id: string;
  name: string;
  telephone_number: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: Date;
}

export interface CurrentUserResponse {
  success: boolean;
  data: UserData;
}

export interface RegisterForm {
  name: string;
  telephone_number: string;
  email: string;
  password: string;
  role?: 'user' | 'admin';
}

// Device Types (placeholder for future)
export interface Device {
  id: string;
  name: string;
  type: 'lcd' | 'sensor' | 'camera' | 'doorbell';
  status: 'online' | 'offline';
  location: string;
}

// Sensor Types (placeholder for future)
export interface SensorData {
  id: string;
  deviceId: string;
  temperature?: number;
  humidity?: number;
  timestamp: Date;
}
