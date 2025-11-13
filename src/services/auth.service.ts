import axios from 'axios';

// Base API configuration - Use NEXT_PUBLIC_ prefix for client-side env vars
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const API_VERSION = '/api/v1';

const apiPath = (path: string) => `${API_BASE_URL}${API_VERSION}${path}`;

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: `${API_BASE_URL}${API_VERSION}`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important: This enables cookies to be sent
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
      // Store token in localStorage AND as a cookie for the backend
      localStorage.setItem('token', response.data.token);
      
      // Set the token as a cookie (backend expects it)
      document.cookie = `token=${response.data.token}; path=/; max-age=86400; SameSite=Lax`;
      
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
export const getCurrentUser = async (
  token?: string
): Promise<CurrentUserResponse | null> => {
  try {
    const authToken = token || localStorage.getItem('token');
    
    if (!authToken) {
      return null;
    }

    // Ensure token is set as cookie
    document.cookie = `token=${authToken}; path=/; max-age=86400; SameSite=Lax`;

    // Changed from POST to GET to match your Postman request
    const response = await apiClient.get('/auth/curuser', {
      headers: {
        'Cookie': `token=${authToken}`, // Add token in Cookie header
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
      // Store token in localStorage and cookie
      localStorage.setItem('token', response.data.token);
      document.cookie = `token=${response.data.token}; path=/; max-age=86400; SameSite=Lax`;
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
    const authToken = token || localStorage.getItem('token');
    
    if (!authToken) {
      return { success: false, message: 'No token found' };
    }

    const response = await apiClient.get('/auth/logout', {
      headers: {
        'Cookie': `token=${authToken}`,
      },
    });

    // Clear token from localStorage and cookies
    localStorage.removeItem('token');
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    return response.data;
  } catch (error: any) {
    console.error('Logout error:', error);
    // Still clear token even if request fails
    localStorage.removeItem('token');
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    return {
      success: false,
      message: error.response?.data?.message || 'Logout failed',
    };
  }
};

// Admin only: Get all users
export const getUsers = async (token?: string): Promise<UserData[]> => {
  try {
    const authToken = token || localStorage.getItem('token');
    
    if (!authToken) {
      throw new Error('No authentication token');
    }

    // Ensure cookie is set
    document.cookie = `token=${authToken}; path=/; max-age=86400; SameSite=Lax`;

    const response = await apiClient.get('/auth/users', {
      headers: {
        'Cookie': `token=${authToken}`,
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
    const authToken = token || localStorage.getItem('token');
    
    if (!authToken) {
      throw new Error('No authentication token');
    }

    // Ensure cookie is set
    document.cookie = `token=${authToken}; path=/; max-age=86400; SameSite=Lax`;

    const response = await apiClient.get('/auth/admins', {
      headers: {
        'Cookie': `token=${authToken}`,
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
    const authToken = token || localStorage.getItem('token');
    
    if (!authToken) {
      throw new Error('No authentication token');
    }

    // Ensure cookie is set
    document.cookie = `token=${authToken}; path=/; max-age=86400; SameSite=Lax`;

    const response = await apiClient.delete(`/auth/users/${userId}`, {
      headers: {
        'Cookie': `token=${authToken}`,
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
    const authToken = token || localStorage.getItem('token');
    
    if (!authToken) {
      throw new Error('No authentication token');
    }

    // Ensure cookie is set
    document.cookie = `token=${authToken}; path=/; max-age=86400; SameSite=Lax`;

    const response = await apiClient.delete(`/auth/admins/${adminId}`, {
      headers: {
        'Cookie': `token=${authToken}`,
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
  return !!localStorage.getItem('token');
};

// Helper function to get stored token
export const getStoredToken = (): string | null => {
  return localStorage.getItem('token');
};