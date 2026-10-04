import { useState } from 'react';
import { ClipboardPaste, Play } from 'lucide-react';
import { Spinner } from '../common/Spinner';
import { parseYouTubeId, thumbnailOf } from '../../utils/youtube';
import { startWatching } from '../../services/watchActions';

const RECENT_KEY = 'duo-watch-recent';

export function readRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
}

/** Remembers what was watched on this device, for one-tap rewatching. */
export function rememberVideo({ videoId, title }) {
  if (!videoId || !title) return;
  try {
    const list = [{ videoId, title }, ...readRecent().filter((v) => v.videoId !== videoId)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Optional convenience.
  }
}

/** Paste a YouTube link (or pick a recent one) to start / switch the video. */
export function VideoPicker({ onDone, compact = false }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recent] = useState(readRecent);

  const start = async (videoId) => {
    if (!videoId) {
      setError("That isn't a YouTube link. Copy the link from YouTube's Share button.");
      return;
    }
    setBusy(true);
    const ok = await startWatching(videoId);
    setBusy(false);
    if (ok) onDone?.();
  };

  const paste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      setValue(clip);
      setError(null);
      if (parseYouTubeId(clip)) start(parseYouTubeId(clip));
    } catch {
      setError('Long-press the box and choose Paste.');
    }
  };

  return (
    <div className={compact ? '' : 'mx-auto w-full max-w-lg'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(parseYouTubeId(value));
        }}
        className="flex items-center gap-2"
      >
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Paste a YouTube link"
          aria-label="YouTube link"
          inputMode="url"
          autoComplete="off"
          className="h-12 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 focus:border-accent/50 focus:outline-none"
        />
        {value.trim() ? (
          <button type="submit" disabled={busy} className="flex h-12 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-on-accent shadow-soft disabled:opacity-60">
            {busy ? <Spinner size={18} /> : <Play size={18} fill="currentColor" />} Watch
          </button>
        ) : (
          <button type="button" onClick={paste} className="flex h-12 items-center gap-2 rounded-full bg-surface-2 px-4 font-semibold">
            <ClipboardPaste size={18} /> Paste
          </button>
        )}
      </form>
      {error && <p className="mt-2 px-2 text-sm text-danger">{error}</p>}

      {recent.length > 0 && (
        <section className="mt-5">
          <h3 className="px-1 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">Watched recently</h3>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {recent.map((v) => (
              <li key={v.videoId}>
                <button type="button" onClick={() => start(v.videoId)} disabled={busy} className="w-full text-left">
                  <img src={thumbnailOf(v.videoId)} alt="" loading="lazy" className="aspect-video w-full rounded-xl bg-surface-2 object-cover" />
                  <span className="mt-1 line-clamp-2 text-[13px] leading-tight font-medium">{v.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
