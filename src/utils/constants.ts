export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
export const API_VERSION = '/api/v1';
export const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5000';

export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/dashboard',
  DEVICES: '/devices',
  ADMIN: '/admin',
};

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    CURRENT_USER: '/auth/curuser',
    LOGOUT: '/auth/logout',
  },
  ADMIN: {
    GET_USERS: '/auth/users',
    GET_ADMINS: '/auth/admins',
    DELETE_USER: '/auth/users',
    DELETE_ADMIN: '/auth/admins',
  },
};
