import { resolveUrl } from '../../utils/url';

export const describeMessage = (m) => {
  if (!m) return '';
  if (m.deleted) return 'Deleted message';
  if (m.type === 'image') return m.text || '📷 Photo';
  if (m.type === 'video') return m.text || '🎥 Video';
  if (m.type === 'audio') return '🎤 Voice message';
  return m.text;
};

/** Quoted original inside a reply bubble (or above the composer). */
export function ReplyQuote({ reply, authorName, mine = false, onClick }) {
  if (!reply) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1 flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl border-l-[3px] py-1.5 pr-2 pl-2.5 text-left text-[13px] ${
        mine ? 'border-white/70 bg-black/15 text-on-accent' : 'border-accent bg-surface-2 text-ink'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-xs font-semibold ${mine ? 'text-on-accent' : 'text-accent-strong'}`}>{authorName}</span>
        <span className={`block truncate ${mine ? 'text-on-accent/85' : 'text-muted'}`}>{describeMessage(reply)}</span>
      </span>
      {reply.thumbnailUrl && <img src={resolveUrl(reply.thumbnailUrl)} alt="" className="size-9 shrink-0 rounded-lg object-cover" />}
    </button>
  );
}
