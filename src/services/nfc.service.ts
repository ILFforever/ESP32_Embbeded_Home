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
 * [ADMIN] Initiate NFC card registration for a specific user.
 * Sends command to backend to put device in listening mode.
 */
export const enableAddCardMode = async (userId: string, deviceId: string): Promise<ApiResponse> => {
  try {
    const response = await axios.post(
      apiPath(`/devices/nfc/register/initiate/admin/${userId}`),
      { deviceId: deviceId },
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to initiate admin add card mode');
  }
};

/**
 * [ADMIN] Cancel NFC card registration initiation for a specific user.
 * Sends command to backend to take device out of listening mode.
 */
export const disableAddCardMode = async (userId: string, deviceId: string): Promise<ApiResponse> => {
  try {
    const response = await axios.post(
      apiPath(`/devices/nfc/register/cancel`),
      { deviceId: deviceId },
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to cancel admin add card mode');
  }
};


/**
 * Initiate NFC card registration for the current logged-in user.
 * The backend will then listen for the next unassigned card scan and associate it.
 */
export const initiateUserNfcRegistration = async (deviceId: string): Promise<ApiResponse> => {
  try {
    const response = await axios.post(
      apiPath('/devices/nfc/register/initiate'),
      { deviceId: deviceId },
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to initiate NFC registration');
  }
};

/**
 * Cancel NFC card registration initiation for the current logged-in user.
 */
export const cancelUserNfcRegistration = async (deviceId: string): Promise<ApiResponse> => {
  try {
    const response = await axios.post(
      apiPath('/devices/nfc/register/cancel'),
      { deviceId: deviceId }, 
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to cancel NFC registration');
  }
};

/**
 * User removes their own NFC card.
 */
export const removeOwnNfcCard = async (cardId: string): Promise<ApiResponse> => {
  try {
    const response = await axios.delete(
      apiPath(`/devices/nfc/cards/${cardId}`),
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to remove NFC card');
  }
};

/**
 * Admin removes an NFC card from a specific user.
 */
export const removeUserNfcCardAdmin = async (cardId: string, userId: string): Promise<ApiResponse> => {
  try {
    const response = await axios.delete(
      apiPath(`/devices/nfc/cards/${cardId}/user/${userId}`),
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to remove NFC card for user');
  }
};

/**
 * Get all users with their NFC cards
 */
export const getUsersWithNfc = async (): Promise<UserWithNfc[]> => {
  try {
    const [usersResponse, adminsResponse] = await Promise.all([
      axios.get(apiPath('/auth/users'), { headers: getAuthHeader() }),
      axios.get(apiPath('/auth/admins'), { headers: getAuthHeader() })
    ]);

    const users = usersResponse.data.data || [];
    const admins = adminsResponse.data.data || [];

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
