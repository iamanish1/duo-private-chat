import { useState } from 'react';
import { Video } from 'lucide-react';
import { STATUS_BACKGROUNDS } from '../../config';
import { resolveUrl } from '../../utils/url';

/** Small square preview of a status (or a quoted one). */
export function StatusThumb({ type, text, background = 0, thumbnailUrl, className = 'size-12 rounded-xl' }) {
  const [failed, setFailed] = useState(false);
  if (type === 'text') {
    return (
      <span className={`flex shrink-0 items-center justify-center overflow-hidden p-1 text-center text-[9px] leading-tight font-semibold text-white ${className}`} style={{ background: STATUS_BACKGROUNDS[background] ?? STATUS_BACKGROUNDS[0] }}>
        <span className="line-clamp-3 break-words">{text}</span>
      </span>
    );
  }
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-surface-2 text-muted ${className}`}>
      {thumbnailUrl && !failed ? (
        <img src={resolveUrl(thumbnailUrl)} alt="" className="size-full object-cover" onError={() => setFailed(true)} draggable={false} />
      ) : null}
      {type === 'video' && <Video size={14} className={`absolute ${thumbnailUrl && !failed ? 'right-1 bottom-1 text-white drop-shadow' : ''}`} />}
    </span>
  );
}
