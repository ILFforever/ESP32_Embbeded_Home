(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/services/auth.service.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "deleteAdmin",
    ()=>deleteAdmin,
    "deleteUser",
    ()=>deleteUser,
    "getAdmins",
    ()=>getAdmins,
    "getCurrentUser",
    ()=>getCurrentUser,
    "getStoredToken",
    ()=>getStoredToken,
    "getUsers",
    ()=>getUsers,
    "isAuthenticated",
    ()=>isAuthenticated,
    "loginUser",
    ()=>loginUser,
    "logoutUser",
    ()=>logoutUser,
    "registerUser",
    ()=>registerUser
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$axios$2f$lib$2f$axios$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/axios/lib/axios.js [app-client] (ecmascript)");
;
// Base API configuration - Use NEXT_PUBLIC_ prefix for client-side env vars
const API_BASE_URL = ("TURBOPACK compile-time value", "http://localhost:5000") || 'http://localhost:5000';
const API_VERSION = '/api/v1';
const apiPath = (path)=>`${API_BASE_URL}${API_VERSION}${path}`;
// Create axios instance with default config
const apiClient = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$axios$2f$lib$2f$axios$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].create({
    baseURL: `${API_BASE_URL}${API_VERSION}`,
    headers: {
        'Content-Type': 'application/json'
    },
    withCredentials: true
});
const loginUser = async (email, password)=>{
    try {
        console.log('Attempting login to:', apiPath('/auth/login'));
        const response = await apiClient.post('/auth/login', {
            email,
            password
        });
        console.log('Login response:', response.data);
        if (response.data.success && response.data.token) {
            // Store token in localStorage
            localStorage.setItem('token', response.data.token);
            return response.data;
        }
        return {
            success: false,
            message: response.data.message || 'Login failed'
        };
    } catch (error) {
        console.error('Login error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            config: error.config
        });
        if (error.code === 'ERR_NETWORK') {
            return {
                success: false,
                message: 'Cannot connect to server. Please ensure the backend is running on ' + API_BASE_URL
            };
        }
        return {
            success: false,
            message: error.response?.data?.msg || error.response?.data?.message || 'Login failed'
        };
    }
};
const getCurrentUser = async (token)=>{
    try {
        const authToken = token || localStorage.getItem('token');
        if (!authToken) {
            return null;
        }
        const response = await apiClient.post('/auth/curuser', {}, {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
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
const registerUser = async (data)=>{
    try {
        const response = await apiClient.post('/auth/register', {
            name: data.name,
            telephone_number: data.telephone_number,
            email: data.email,
            password: data.password,
            role: data.role || 'user'
        });
        return response.data;
    } catch (error) {
        console.error('Registration error:', error);
        return {
            success: false,
            message: error.response?.data?.message || 'Registration failed'
        };
    }
};
const logoutUser = async (token)=>{
    try {
        const authToken = token || localStorage.getItem('token');
        if (!authToken) {
            return {
                success: false,
                message: 'No token found'
            };
        }
        const response = await apiClient.get('/auth/logout', {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });
        // Clear token from localStorage
        localStorage.removeItem('token');
        return response.data;
    } catch (error) {
        console.error('Logout error:', error);
        // Still clear token even if request fails
        localStorage.removeItem('token');
        return {
            success: false,
            message: error.response?.data?.message || 'Logout failed'
        };
    }
};
const getUsers = async (token)=>{
    try {
        const authToken = token || localStorage.getItem('token');
        if (!authToken) {
            throw new Error('No authentication token');
        }
        const response = await apiClient.get('/auth/users', {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
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
const getAdmins = async (token)=>{
    try {
        const authToken = token || localStorage.getItem('token');
        if (!authToken) {
            throw new Error('No authentication token');
        }
        const response = await apiClient.get('/auth/admins', {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
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
const deleteUser = async (userId, token)=>{
    try {
        const authToken = token || localStorage.getItem('token');
        if (!authToken) {
            throw new Error('No authentication token');
        }
        const response = await apiClient.delete(`/auth/users/${userId}`, {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });
        return response.data;
    } catch (error) {
        console.error('Delete user error:', error);
        return {
            success: false,
            message: error.response?.data?.message || 'Delete user failed'
        };
    }
};
const deleteAdmin = async (adminId, token)=>{
    try {
        const authToken = token || localStorage.getItem('token');
        if (!authToken) {
            throw new Error('No authentication token');
        }
        const response = await apiClient.delete(`/auth/admins/${adminId}`, {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });
        return response.data;
    } catch (error) {
        console.error('Delete admin error:', error);
        return {
            success: false,
            message: error.response?.data?.message || 'Delete admin failed'
        };
    }
};
const isAuthenticated = ()=>{
    return !!localStorage.getItem('token');
};
const getStoredToken = ()=>{
    return localStorage.getItem('token');
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/context/AuthContext.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AuthProvider",
    ()=>AuthProvider,
    "useAuth",
    ()=>useAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$auth$2e$service$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/services/auth.service.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
'use client';
;
;
const AuthContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(undefined);
const useAuth = ()=>{
    _s();
    const context = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
_s(useAuth, "b9L3QQ+jgeyIrH0NfHrJ8nn7VMU=");
const AuthProvider = ({ children })=>{
    _s1();
    const [user, setUser] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [isLoading, setIsLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    // Check if user is authenticated on mount
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AuthProvider.useEffect": ()=>{
            checkAuth();
        }
    }["AuthProvider.useEffect"], []);
    const checkAuth = async ()=>{
        try {
            const token = localStorage.getItem('token');
            if (token) {
                const response = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$auth$2e$service$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getCurrentUser"])(token);
                if (response && response.success) {
                    setUser(response.data);
                } else {
                    // Token invalid, clear it
                    localStorage.removeItem('token');
                    setUser(null);
                }
            }
        } catch (error) {
            console.error('Auth check error:', error);
            localStorage.removeItem('token');
            setUser(null);
        } finally{
            setIsLoading(false);
        }
    };
    const login = async (email, password)=>{
        try {
            const response = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$auth$2e$service$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["loginUser"])(email, password);
            if (response.success && response.token) {
                // Fetch user data after successful login
                const userResponse = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$auth$2e$service$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getCurrentUser"])(response.token);
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
    const logout = async ()=>{
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$auth$2e$service$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["logoutUser"])();
        } catch (error) {
            console.error('Logout error:', error);
        } finally{
            setUser(null);
            localStorage.removeItem('token');
        }
    };
    const refreshUser = async ()=>{
        try {
            const token = localStorage.getItem('token');
            if (token) {
                const response = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$auth$2e$service$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getCurrentUser"])(token);
                if (response && response.success) {
                    setUser(response.data);
                }
            }
        } catch (error) {
            console.error('Refresh user error:', error);
        }
    };
    const value = {
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshUser
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AuthContext.Provider, {
        value: value,
        children: children
    }, void 0, false, {
        fileName: "[project]/src/context/AuthContext.tsx",
        lineNumber: 119,
        columnNumber: 10
    }, ("TURBOPACK compile-time value", void 0));
};
_s1(AuthProvider, "YajQB7LURzRD+QP5gw0+K2TZIWA=");
_c = AuthProvider;
var _c;
__turbopack_context__.k.register(_c, "AuthProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_5cb81a80._.js.map