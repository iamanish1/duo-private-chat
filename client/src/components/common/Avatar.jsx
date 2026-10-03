import { useState } from 'react';
import { initials } from '../../utils/format';
import { resolveUrl } from '../../utils/url';

const SIZES = { xs: 'size-7 text-[11px]', sm: 'size-9 text-xs', md: 'size-11 text-sm', lg: 'size-16 text-lg', xl: 'size-28 text-3xl' };

export function Avatar({ user, size = 'md', online = false, className = '' }) {
  // Remember which URL failed, so a newly set photo is tried again.
  const [failedUrl, setFailedUrl] = useState(null);
  const src = user?.avatarUrl && user.avatarUrl !== failedUrl ? resolveUrl(user.avatarUrl) : null;

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <span
        className={`${SIZES[size]} inline-flex items-center justify-center overflow-hidden rounded-full bg-accent-soft font-semibold text-accent-strong ring-1 ring-line`}
      >
        {src ? (
          <img src={src} alt="" className="size-full object-cover" onError={() => setFailedUrl(user.avatarUrl)} draggable={false} />
        ) : (
          <span aria-hidden="true">{initials(user?.name)}</span>
        )}
      </span>
      {online && (
        <span className="absolute right-0 bottom-0 size-3 rounded-full bg-online ring-2 ring-surface" aria-label="Online" />
      )}
    </span>
  );
}
