import axios from 'axios';
import { API_BASE } from '../config';

export class ApiError extends Error {
  constructor({ status = 0, code = 'ERROR', message = 'Something went wrong.', cancelled = false }) {
    super(message);
    this.status = status;
    this.code = code;
    this.cancelled = cancelled;
  }
}

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  withCredentials: true,
  timeout: 20_000,
  // Required by the server's CSRF guard on state-changing requests.
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

const sessionLostListeners = new Set();
export const onSessionLost = (listener) => {
  sessionLostListeners.add(listener);
  return () => sessionLostListeners.delete(listener);
};

export function toApiError(error) {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return new ApiError({ code: 'CANCELLED', message: 'Cancelled.', cancelled: true });
  if (!error.response) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    return new ApiError({
      code: offline ? 'OFFLINE' : 'NETWORK_ERROR',
      message: offline ? "You're offline. Check your connection." : "Can't reach the server right now. Please try again.",
    });
  }
  const { status, data } = error.response;
  return new ApiError({ status, code: data?.error?.code, message: data?.error?.message || 'Something went wrong. Please try again.' });
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error);
    if (apiError.status === 401 && !error.config?.skipSessionCheck) sessionLostListeners.forEach((fn) => fn(apiError));
    return Promise.reject(apiError);
  },
);

const data = (promise) => promise.then((res) => res.data);

export const authApi = {
  login: (email, password) => data(api.post('/auth/login', { email, password }, { skipSessionCheck: true })),
  logout: () => data(api.post('/auth/logout', null, { skipSessionCheck: true })),
  logoutEverywhere: () => data(api.post('/auth/logout-all')),
  me: () => data(api.get('/auth/me', { skipSessionCheck: true })),
  // Duo code: lock on reopen, check whether this device can be unlocked, unlock.
  lock: () => data(api.post('/auth/lock', null, { skipSessionCheck: true })),
  lockStatus: () => data(api.get('/auth/lock-status', { skipSessionCheck: true })),
  unlock: (pin) => data(api.post('/auth/unlock', { pin }, { skipSessionCheck: true })),
};

export const chatApi = {
  conversation: () => data(api.get('/conversation')),
  setWallpaper: (body) => data(api.put('/conversation/wallpaper', body)),
  uploadWallpaper: (formData, { onProgress } = {}) =>
    data(api.post('/conversation/wallpaper/photo', formData, { timeout: 0, onUploadProgress: (e) => e.total && onProgress?.(e.loaded / e.total) })),
  messages: (params) => data(api.get('/messages', { params })),
  send: (body) => data(api.post('/messages', body)),
  markRead: (id) => data(api.patch(`/messages/${id}/read`)),
  remove: (id) => data(api.delete(`/messages/${id}`)),
  edit: (id, text) => data(api.patch(`/messages/${id}`, { text })),
  react: (id, emoji) => data(api.put(`/messages/${id}/reaction`, { emoji })),
  keep: (id, keep) => data(api.put(`/messages/${id}/keep`, { keep })),
  expiring: () => data(api.get('/messages/expiring')),
  search: (params, signal) => data(api.get('/messages/search', { params, signal })),
  media: (params) => data(api.get('/messages/media', { params })),
  upload: (formData, { onProgress, signal }) =>
    data(
      api.post('/media/upload', formData, {
        signal,
        timeout: 0,
        onUploadProgress: (e) => e.total && onProgress?.(e.loaded / e.total),
      }),
    ),
};

export const userApi = {
  update: (body) => data(api.patch('/users/me', body)),
  uploadAvatar: (formData) => data(api.post('/users/me/avatar', formData, { timeout: 0 })),
  removeAvatar: () => data(api.delete('/users/me/avatar')),
  setPin: (password, pin) => data(api.put('/users/me/pin', { password, pin })),
  removePin: (password) => data(api.delete('/users/me/pin', { data: { password } })),
};

export const notificationApi = {
  publicKey: () => data(api.get('/notifications/public-key')),
  subscribe: (subscription) => data(api.post('/notifications/subscribe', subscription)),
  unsubscribe: (endpoint) => data(api.delete('/notifications/subscribe', { data: { endpoint } })),
  test: () => data(api.post('/notifications/test')),
};

export const statusApi = {
  list: () => data(api.get('/statuses')),
  postText: (text, background) => data(api.post('/statuses', { text, background })),
  upload: (formData, { onProgress, signal } = {}) =>
    data(
      api.post('/statuses/media', formData, {
        signal,
        timeout: 0,
        onUploadProgress: (e) => e.total && onProgress?.(e.loaded / e.total),
      }),
    ),
  view: (id) => data(api.post(`/statuses/${id}/view`)),
  remove: (id) => data(api.delete(`/statuses/${id}`)),
};

export const callApi = {
  history: (params) => data(api.get('/calls', { params })),
  iceServers: () => data(api.get('/calls/ice-servers')),
};
