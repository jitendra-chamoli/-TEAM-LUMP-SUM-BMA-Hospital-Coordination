import axios from 'axios';
import { io } from 'socket.io-client';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
export const ORCHESTRATOR_URL = import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:5001';

export const api = axios.create({ baseURL: API_BASE_URL });
export const orchestratorApi = axios.create({ baseURL: ORCHESTRATOR_URL });

// ---------- Session ----------

export const getToken = () => localStorage.getItem('token');

export const getStoredUser = () => {
    try {
        return JSON.parse(localStorage.getItem('user'));
    } catch {
        return null;
    }
};

export const saveSession = (token, user) => {
    if (token) localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
};

export const clearSession = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
};

// App.jsx listens for these to sign the user out or ask for a new password.
export const AUTH_EVENT = 'bma:auth';
const emitAuthEvent = (detail) => window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail }));

// ---------- HTTP ----------

for (const instance of [api, orchestratorApi]) {
    instance.interceptors.request.use((config) => {
        const token = getToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
    });

    instance.interceptors.response.use(
        (response) => response,
        (error) => {
            const { status, data } = error.response || {};
            if (getToken()) {
                if (status === 401) {
                    emitAuthEvent({ type: 'signed_out', message: data?.message || data?.error || 'Your session has ended. Sign in again.' });
                } else if (status === 403 && data?.code === 'PASSWORD_CHANGE_REQUIRED') {
                    emitAuthEvent({ type: 'password_change_required' });
                }
            }
            return Promise.reject(error);
        }
    );
}

// ---------- Real-time ----------

// Connects only once signed in; the server checks the token and puts the
// socket in the user's hospital room, so only that hospital's events arrive.
export const socket = io(API_BASE_URL, {
    autoConnect: false,
    auth: (cb) => cb({ token: getToken() })
});

export const connectSocket = () => {
    if (!socket.connected) socket.connect();
};

export const disconnectSocket = () => socket.disconnect();

socket.on('connect_error', (err) => {
    if (/deactivated|not found|unauthorized/i.test(err.message) && getToken()) {
        emitAuthEvent({ type: 'signed_out', message: err.message });
    }
});

// Server-initiated disconnect (account deactivated, password reset, doctor removed)
socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' && getToken()) {
        emitAuthEvent({ type: 'signed_out', message: 'Your account was changed by an admin. Sign in again.' });
    }
});

// ---------- Helpers ----------

// Extracts a human-readable message from an API error response, handling both
// plain { message } / { error } shapes and Zod validation's { error, details }.
export const getErrorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
    const data = err?.response?.data;
    if (!data) return fallback;
    if (Array.isArray(data.details) && data.details.length > 0) {
        return data.details.map(d => d.message).join(', ');
    }
    return data.message || data.error || fallback;
};
