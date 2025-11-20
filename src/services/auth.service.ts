import axios from 'axios';
import { setCookie, getCookie, deleteCookie } from '@/utils/cookies';

// Base API configuration - Use NEXT_PUBLIC_ prefix for client-side env vars
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const API_VERSION = '/api/v1';

const apiPath = (path: string) => `${API_BASE_URL}${API_VERSION}${path}`;

// Cookie name for storing auth token
const AUTH_TOKEN_COOKIE = 'auth_token';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: `${API_BASE_URL}${API_VERSION}`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Interfaces matching your backend responses
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

// Login user
export const loginUser = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  try {
    console.log('Attempting login to:', apiPath('/auth/login'));
    
    const response = await apiClient.post('/auth/login', { 
      email, 
      password 
    });
    
    console.log('Login response:', response.data);

    if (response.data.success && response.data.token) {
      // Store token in cookie (expires in 7 days)
      setCookie(AUTH_TOKEN_COOKIE, response.data.token, 7);

      return response.data;
    }
    
    return { 
      success: false, 
      message: response.data.message || 'Login failed' 
    };
  } catch (error: any) {
    console.error('Login error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      config: error.config
    });
    
    if (error.code === 'ERR_NETWORK') {
      return {
        success: false,
        message: 'Cannot connect to server. Please ensure the backend is running on ' + API_BASE_URL,
      };
    }
    
    return {
      success: false,
      message: error.response?.data?.msg || error.response?.data?.message || 'Login failed',
    };
  }
};

// Get current user - Changed to GET request to match backend
export const getCurrentUser = async (): Promise<CurrentUserResponse | null> => {
  try {
    const authToken = getCookie(AUTH_TOKEN_COOKIE);

    if (!authToken) {
      return null;
    }

    // Changed from POST to GET to match your Postman request
    const response = await apiClient.get('/auth/curuser', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (response.status === 200 && response.data.success) {
      return response.data;
    }

    return null;
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
};

// Register user
export const registerUser = async (
  data: RegisterForm
): Promise<AuthResponse> => {
  try {
    const response = await apiClient.post('/auth/register', {
      name: data.name,
      telephone_number: data.telephone_number,
      email: data.email,
      password: data.password,
      role: data.role || 'user',
    });

    if (response.data.success && response.data.token) {
      // Store token in cookie (expires in 7 days)
      setCookie(AUTH_TOKEN_COOKIE, response.data.token, 7);
    }

    return response.data;
  } catch (error: any) {
    console.error('Registration error:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Registration failed',
    };
  }
};

// Logout user
export const logoutUser = async (token?: string): Promise<AuthResponse> => {
  try {
    const authToken = token || getCookie(AUTH_TOKEN_COOKIE);

    if (!authToken) {
      return { success: false, message: 'No token found' };
    }

    const response = await apiClient.get('/auth/logout', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    // Clear token from cookie
    deleteCookie(AUTH_TOKEN_COOKIE);

    return response.data;
  } catch (error: any) {
    console.error('Logout error:', error);
    // Still clear token even if request fails
    deleteCookie(AUTH_TOKEN_COOKIE);
    return {
      success: false,
      message: error.response?.data?.message || 'Logout failed',
    };
  }
};

// Admin only: Get all users
export const getUsers = async (token?: string): Promise<UserData[]> => {
  try {
    const authToken = token || getCookie(AUTH_TOKEN_COOKIE);

    if (!authToken) {
      throw new Error('No authentication token');
    }

    const response = await apiClient.get('/auth/users', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (response.data.success) {
      return response.data.data;
    }

    return [];
  } catch (error) {
    console.error('Get users error:', error);
    throw error;
  }
};

// Admin only: Get all admins
export const getAdmins = async (token?: string): Promise<UserData[]> => {
  try {
    const authToken = token || getCookie(AUTH_TOKEN_COOKIE);

    if (!authToken) {
      throw new Error('No authentication token');
    }

    const response = await apiClient.get('/auth/admins', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (response.data.success) {
      return response.data.data;
    }

    return [];
  } catch (error) {
    console.error('Get admins error:', error);
    throw error;
  }
};

// Admin only: Delete user
export const deleteUser = async (
  userId: string,
  token?: string
): Promise<AuthResponse> => {
  try {
    const authToken = token || getCookie(AUTH_TOKEN_COOKIE);

    if (!authToken) {
      throw new Error('No authentication token');
    }

    const response = await apiClient.delete(`/auth/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    return response.data;
  } catch (error: any) {
    console.error('Delete user error:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Delete user failed',
    };
  }
};

// Admin only: Delete admin
export const deleteAdmin = async (
  adminId: string,
  token?: string
): Promise<AuthResponse> => {
  try {
    const authToken = token || getCookie(AUTH_TOKEN_COOKIE);

    if (!authToken) {
      throw new Error('No authentication token');
    }

    const response = await apiClient.delete(`/auth/admins/${adminId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    return response.data;
  } catch (error: any) {
    console.error('Delete admin error:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Delete admin failed',
    };
  }
};

// Helper function to check if user is authenticated
export const isAuthenticated = (): boolean => {
  return !!getCookie(AUTH_TOKEN_COOKIE);
};

// Helper function to get stored token
export const getStoredToken = (): string | null => {
  return getCookie(AUTH_TOKEN_COOKIE);
};