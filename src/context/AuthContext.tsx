'use client';
import React, {createContext, useContext, useState, useEffect } from 'react';
import {
  loginUser as loginUserService,
  logoutUser as logoutUserService,
  getCurrentUser,
  UserData,
} from '../services/auth.service';
import { getCookie, deleteCookie } from '@/utils/cookies';


interface AuthContextType {
  user: UserData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Check if user is authenticated on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = getCookie('auth_token');
      if (token) {
        const response = await getCurrentUser();
        if (response && response.success) {
          setUser(response.data);
        } else {
          // Token invalid, clear it
          deleteCookie('auth_token');
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
      deleteCookie('auth_token');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await loginUserService(email, password);

      if (response.success && response.token) {
        // Fetch user data after successful login
        const userResponse = await getCurrentUser();
        if (userResponse && userResponse.success) {
          setUser(userResponse.data);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await logoutUserService();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      deleteCookie('auth_token');
    }
  };

  const refreshUser = async () => {
    try {
      const token = getCookie('auth_token');
      if (token) {
        const response = await getCurrentUser();
        if (response && response.success) {
          setUser(response.data);
        }
      }
    } catch (error) {
      console.error('Refresh user error:', error);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};