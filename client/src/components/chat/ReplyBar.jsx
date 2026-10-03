import { Reply, X } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { describeMessage } from './ReplyQuote';
import { resolveUrl } from '../../utils/url';

export function ReplyBar({ message, authorName, onCancel }) {
  const thumb = message.localPreview?.thumbnailUrl ?? message.media?.thumbnailUrl;
  return (
    <div className="flex animate-fade-in items-center gap-3 px-3 pt-2">
      <Reply size={18} className="shrink-0 text-accent" />
      <div className="min-w-0 flex-1 border-l-[3px] border-accent pl-2.5">
        <p className="text-xs font-semibold text-accent-strong">Replying to {authorName}</p>
        <p className="truncate text-sm text-muted">{describeMessage(message)}</p>
      </div>
      {thumb && <img src={resolveUrl(thumb)} alt="" className="size-10 rounded-lg object-cover" />}
      <IconButton label="Cancel reply" variant="muted" size="sm" onClick={onCancel}>
        <X size={18} />
      </IconButton>
    </div>
  );
}
