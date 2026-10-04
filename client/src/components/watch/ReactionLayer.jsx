import { useWatchStore } from '../../store/watchStore';
import { sendReaction } from '../../services/watchActions';

export const WATCH_REACTIONS = ['😂', '😍', '😮', '😢', '🔥', '👏'];

/** Emoji that float up over the video — yours on the right, theirs on the left. */
export function ReactionLayer() {
  const reactions = useWatchStore((s) => s.reactions);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {reactions.map((r) => (
        <span key={r.id} className="absolute bottom-3 animate-float-up text-4xl drop-shadow-lg" style={{ left: `${r.left}%` }}>
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

export function ReactionBar({ disabled }) {
  return (
    <div className="flex items-center justify-center gap-1.5" role="group" aria-label="Send a reaction">
      {WATCH_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => sendReaction(emoji)}
          disabled={disabled}
          aria-label={`React ${emoji}`}
          className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-[22px] transition hover:scale-110 active:scale-90 disabled:opacity-40"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
