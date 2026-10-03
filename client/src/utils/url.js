import { API_BASE } from '../config';

/** Server returns relative paths for the local media driver; Cloudinary URLs are absolute. */
export function resolveUrl(url) {
  if (!url) return url;
  if (/^(https?:|blob:|data:)/.test(url)) return url;
  return `${API_BASE}${url}`;
}
