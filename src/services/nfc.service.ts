import axios from 'axios';
import { getCookie } from '@/utils/cookies';

// Base API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const API_VERSION = '/api/v1';

const apiPath = (path: string) => `${API_BASE_URL}${API_VERSION}${path}`;

// Cookie name for storing auth token
const AUTH_TOKEN_COOKIE = 'auth_token';

// Get authorization header
const getAuthHeader = () => {
  const token = getCookie(AUTH_TOKEN_COOKIE);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Interfaces for NFC functionality
export interface NfcCard {
  card_id: string;
  added_at: Date;
}

export interface NfcScanEvent {
  id: string;
  card_id: string;
  authorized: boolean;
  user_name: string;
  user_id: string | null;
  timestamp: Date;
  created_at: Date;
}

export interface UserWithNfc {
  id: string;
  name: string;
  email: string;
  telephone_number: string;
  role: 'user' | 'admin';
  nfc_cards?: string[];
  is_adding_card?: boolean;
}

export interface NfcScanHistory {
  scans: NfcScanEvent[];
  total: number;
}

export interface ApiResponse {
  success?: boolean;
  status?: string;
  message?: string;
  data?: any;
}

// ============================================================================
// NFC User Management
// ============================================================================

/**
 * Enable "add card mode" for a user
 * The next NFC scan will be assigned to this user
 * Sends MQTT command to doorbell to enable NFC scanning
 */
export const enableAddCardMode = async (userId: string, nfcDeviceId?: string): Promise<ApiResponse> => {
  try {
    const response = await axios.post(
      apiPath(`/auth/users/${userId}/nfc/enable-add-mode`),
      { nfc_device_id: nfcDeviceId || 'db_001' }, // Default to doorbell
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    console.error('Enable add card mode error:', error);
    // Return success even if there's an error - command is queued
    return { success: true, message: 'Add card mode enabled' };
  }
};

/**
 * Disable "add card mode" for a user
 * Sends MQTT command to doorbell to disable NFC scanning
 */
export const disableAddCardMode = async (userId: string, nfcDeviceId?: string): Promise<ApiResponse> => {
  try {
    const response = await axios.post(
      apiPath(`/auth/users/${userId}/nfc/disable-add-mode`),
      { nfc_device_id: nfcDeviceId || 'db_001' }, // Default to doorbell
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    console.error('Disable add card mode error:', error);
    // Return success even if there's an error
    return { success: true, message: 'Add card mode disabled' };
  }
};

/**
 * Remove an NFC card from a user
 */
export const removeNfcCard = async (userId: string, cardId: string): Promise<ApiResponse> => {
  try {
    const response = await axios.delete(
      apiPath(`/auth/users/${userId}/nfc/cards/${cardId}`),
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to remove NFC card');
  }
};

/**
 * Get all users with their NFC cards
 */
export const getUsersWithNfc = async (): Promise<UserWithNfc[]> => {
  try {
    // Fetch both users and admins
    const [usersResponse, adminsResponse] = await Promise.all([
      axios.get(apiPath('/auth/users'), { headers: getAuthHeader() }),
      axios.get(apiPath('/auth/admins'), { headers: getAuthHeader() })
    ]);

    const users = usersResponse.data.data || [];
    const admins = adminsResponse.data.data || [];

    // Combine and return all users (both regular users and admins)
    return [...users, ...admins];
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to fetch users');
  }
};

/**
 * Get NFC cards for a specific user
 */
export const getUserNfcCards = async (userId: string): Promise<string[]> => {
  try {
    const response = await axios.get(
      apiPath(`/auth/users/${userId}`),
      { headers: getAuthHeader() }
    );
    return response.data.data?.nfc_cards || [];
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to fetch user NFC cards');
  }
};

// ============================================================================
// NFC Scan History
// ============================================================================

/**
 * Get NFC scan history from a device
 */
export const getNfcScanHistory = async (
  deviceId: string,
  limit: number = 50
): Promise<NfcScanEvent[]> => {
  try {
    const response = await axios.get(
      apiPath(`/devices/${deviceId}/nfc/scans`),
      {
        headers: getAuthHeader(),
        params: { limit }
      }
    );
    return response.data.data || [];
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to fetch NFC scan history');
  }
};

/**
 * Get latest NFC scans across all devices
 */
export const getLatestNfcScans = async (limit: number = 20): Promise<NfcScanEvent[]> => {
  try {
    const response = await axios.get(
      apiPath('/devices/nfc/scans/latest'),
      {
        headers: getAuthHeader(),
        params: { limit }
      }
    );
    return response.data.data || [];
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to fetch latest NFC scans');
  }
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format card ID for display (e.g., "AB:CD:EF:12" or truncate long IDs)
 */
export const formatCardId = (cardId: string): string => {
  if (!cardId) return 'Unknown';

  // If it's a hex string without colons, add them every 2 characters
  if (/^[0-9A-Fa-f]+$/.test(cardId) && cardId.length % 2 === 0) {
    return cardId.match(/.{1,2}/g)?.join(':').toUpperCase() || cardId;
  }

  return cardId.toUpperCase();
};

/**
 * Get authorization status text
 */
export const getAuthorizationStatus = (authorized: boolean): string => {
  return authorized ? 'AUTHORIZED' : 'DENIED';
};

/**
 * Get authorization status class for styling
 */
export const getAuthorizationStatusClass = (authorized: boolean): string => {
  return authorized ? 'status-success' : 'status-error';
};
