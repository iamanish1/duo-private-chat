import { sendText } from '../../services/chatActions';

const STARTERS = ['Hi 👋', 'Hey you ❤️', 'Good morning ☀️'];

export function EmptyChat({ peer }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="relative mb-2 flex h-20 w-28 items-center justify-center" aria-hidden="true">
        <span className="absolute left-2 size-16 rounded-full border-[7px] border-accent" />
        <span className="absolute right-2 size-16 rounded-full border-[7px] border-accent/45" />
      </div>
      <h2 className="text-xl font-semibold text-balance">Just the two of you</h2>
      <p className="max-w-xs text-sm text-pretty text-muted">
        This is your private space with {peer?.name ?? 'your person'}. Nobody else can join, read or see what you share here.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {STARTERS.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => sendText(text)}
            className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium shadow-soft transition hover:border-accent/40 active:scale-95"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
