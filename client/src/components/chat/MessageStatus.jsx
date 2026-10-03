import { Check, CheckCheck, CircleAlert, Clock3 } from 'lucide-react';

const LABELS = { sending: 'Sending', sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Not sent' };

/** Sending → clock · Sent → ✓ · Delivered → ✓✓ · Read → highlighted ✓✓ */
export function MessageStatus({ status, onMedia = false }) {
  const base = onMedia ? 'text-white/85' : 'text-on-accent/70';
  const props = { size: 15, strokeWidth: 2.25, 'aria-label': LABELS[status], role: 'img' };
  switch (status) {
    case 'sending':
      return <Clock3 {...props} size={13} className={`${base} animate-pulse`} />;
    case 'sent':
      return <Check {...props} className={base} />;
    case 'delivered':
      return <CheckCheck {...props} className={base} />;
    case 'read':
      return <CheckCheck {...props} className="text-read drop-shadow-[0_0_6px_rgb(255_224_168/0.35)]" />;
    case 'failed':
      return <CircleAlert {...props} className="text-white" />;
    default:
      return null;
  }
}
