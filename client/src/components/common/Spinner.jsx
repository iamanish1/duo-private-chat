import { LoaderCircle } from 'lucide-react';

export function Spinner({ size = 20, className = '', label = 'Loading' }) {
  return <LoaderCircle size={size} className={`animate-spin ${className}`} aria-label={label} role="status" />;
}
