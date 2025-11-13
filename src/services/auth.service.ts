import axios from 'axios';

// Base API configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API_VERSION = '/api/v1';

const apiPath = (path: string) => `${API_BASE_URL}${API_VERSION}${path}`;

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
    const response = await axios.post(
      apiPath('/auth/login'),
      { email, password },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        withCredentials: true, // Important for cookies
      }
    );
    
    if (response.data.success) {
      // Store token in localStorage
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
      }
      return response.data;
    }
    
    return { success: false, message: 'Login failed' };
  } catch (error: any) {
    console.error('Login error:', error);
    return {
      success: false,
      message: error.response?.data?.msg || 'Login failed',
    };
  }
};

// Get current user (Note: backend uses POST, not GET)
export const getCurrentUser = async (
  token?: string
): Promise<CurrentUserResponse | null> => {
  try {
    const authToken = token || localStorage.getItem('token');
    
    if (!authToken) {
      return null;
    }

    const response = await axios.post(
      apiPath('/auth/curuser'),
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        withCredentials: true,
      }
    );

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
    const response = await axios.post(
      apiPath('/auth/register'),
      {
        name: data.name,
        telephone_number: data.telephone_number,
        email: data.email,
        password: data.password,
        role: data.role || 'user',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

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

    const response = await axios.get(apiPath('/auth/logout'), {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      withCredentials: true,
    });

    // Clear token from localStorage
    localStorage.removeItem('token');

    return response.data;
  } catch (error: any) {
    console.error('Logout error:', error);
    // Still clear token even if request fails
    localStorage.removeItem('token');
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

    const response = await axios.get(apiPath('/auth/users'), {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      withCredentials: true,
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

    const response = await axios.get(apiPath('/auth/admins'), {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      withCredentials: true,
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

    const response = await axios.delete(apiPath(`/auth/users/${userId}`), {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      withCredentials: true,
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

    const response = await axios.delete(apiPath(`/auth/admins/${adminId}`), {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      withCredentials: true,
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