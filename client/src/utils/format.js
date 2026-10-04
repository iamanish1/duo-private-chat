const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fullDateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 24 * 60 * 60 * 1000;

export const formatTime = (value) => timeFormat.format(new Date(value));

export function isSameDay(a, b) {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

export function formatDayLabel(value, now = new Date()) {
  const date = new Date(value);
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return weekdayFormat.format(date);
  if (date.getFullYear() === now.getFullYear()) return dateFormat.format(date);
  return fullDateFormat.format(date);
}

export function formatLastSeen(value, now = new Date()) {
  if (!value) return 'Offline';
  const date = new Date(value);
  const diffMs = now - date;
  if (diffMs < 60_000) return 'Last seen just now';
  if (diffMs < 60 * 60_000) {
    const minutes = Math.floor(diffMs / 60_000);
    return `Last seen ${minutes} min ago`;
  }
  const day = formatDayLabel(date, now);
  if (day === 'Today') return `Last seen today at ${formatTime(date)}`;
  if (day === 'Yesterday') return `Last seen yesterday at ${formatTime(date)}`;
  return `Last seen ${day}`;
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';

/** "Just now", "12 min ago", "3 h ago" — for 24-hour statuses. */
export function formatAgo(value, now = new Date()) {
  const diffMs = now - new Date(value);
  if (diffMs < 60_000) return 'Just now';
  if (diffMs < 60 * 60_000) return `${Math.floor(diffMs / 60_000)} min ago`;
  const day = formatDayLabel(value, now);
  return `${day === 'Today' ? 'Today' : 'Yesterday'} at ${formatTime(value)}`;
}

/** "12 Oct 2028" — for dates in the future (e.g. when a video will be removed). */
export const formatDate = (value) => fullDateFormat.format(new Date(value));
