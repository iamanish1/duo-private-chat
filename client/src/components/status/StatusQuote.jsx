import { CircleDashed } from 'lucide-react';
import { StatusThumb } from './StatusThumb';
import { openQuotedStatus } from '../../services/statusActions';

const describe = (reply) => reply.text || (reply.type === 'video' ? '🎥 Video' : reply.type === 'image' ? '📷 Photo' : 'Status');

/** The status a chat message replies to, quoted at the top of the bubble. */
export function StatusQuote({ reply, ownerName, mine = false }) {
  return (
    <button
      type="button"
      onClick={() => openQuotedStatus(reply)}
      className={`mb-1 flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl border-l-[3px] py-1.5 pr-1.5 pl-2.5 text-left text-[13px] ${
        mine ? 'border-white/70 bg-black/15 text-on-accent' : 'border-accent bg-surface-2 text-ink'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-1 text-xs font-semibold ${mine ? 'text-on-accent' : 'text-accent-strong'}`}>
          <CircleDashed size={12} /> {ownerName} · Status
        </span>
        <span className={`block truncate ${mine ? 'text-on-accent/85' : 'text-muted'}`}>{describe(reply)}</span>
      </span>
      <StatusThumb type={reply.type} text={reply.text} background={reply.background} thumbnailUrl={reply.thumbnailUrl} className="size-10 rounded-lg" />
    </button>
  );
}
