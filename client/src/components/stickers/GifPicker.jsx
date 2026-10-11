import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Spinner } from '../common/Spinner';
import { searchGifs, send } from '../../services/stickerActions';

/** GIFs tab: trending until you type, then search (debounced). */
export function GifPicker({ onSent }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [next, setNext] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const request = useRef(0);

  const load = async (q, offset) => {
    const id = ++request.current;
    setLoading(true);
    try {
      const page = await searchGifs(q, offset);
      if (id !== request.current) return;
      setGifs((list) => (offset ? [...list, ...page.gifs] : page.gifs));
      setNext(page.nextOffset);
      setHasMore(page.hasMore);
      setError(null);
    } catch (err) {
      if (id === request.current) setError(err.code === 'GIFS_NOT_CONFIGURED' ? 'setup' : err.message);
    } finally {
      if (id === request.current) setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => load(query, 0), query ? 400 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  const pick = (gif) => {
    send({ kind: 'gif', id: gif.id, url: gif.url, width: gif.width, height: gif.height, title: gif.title });
    onSent?.();
  };

  if (error === 'setup') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="font-semibold">GIFs aren't switched on yet</p>
        <p className="mt-1 text-sm text-muted">Add a free GIPHY key as GIPHY_API_KEY in Render's settings, and GIF search appears here.</p>
      </div>
    );
  }

  // Two columns, each filled with whichever is shorter (simple masonry).
  const columns = [[], []];
  const heights = [0, 0];
  for (const gif of gifs) {
    const col = heights[0] <= heights[1] ? 0 : 1;
    columns[col].push(gif);
    heights[col] += gif.height / gif.width;
  }

  return (
    <div className="flex h-full flex-col">
      <label className="mx-3 mt-2 mb-1 flex items-center gap-2 rounded-full bg-surface-2 px-3">
        <Search size={16} className="text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search GIFs" aria-label="Search GIFs" className="h-9 min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
      </label>
      <div className="scroll-area min-h-0 flex-1 px-2 pb-2">
        {error && <p className="py-6 text-center text-sm text-muted">{error}</p>}
        <div className="grid grid-cols-2 gap-1.5">
          {columns.map((col, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              {col.map((gif) => (
                <button key={gif.id} type="button" onClick={() => pick(gif)} aria-label={`Send GIF ${gif.title}`} className="overflow-hidden rounded-xl bg-surface-2 transition active:scale-95">
                  <img src={gif.url} alt="" loading="lazy" className="block w-full" style={{ aspectRatio: `${gif.width} / ${gif.height}` }} draggable={false} />
                </button>
              ))}
            </div>
          ))}
        </div>
        {loading && (
          <div className="flex justify-center py-4 text-muted">
            <Spinner size={18} />
          </div>
        )}
        {!loading && hasMore && (
          <button type="button" onClick={() => load(query, next)} className="mx-auto mt-2 block rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold">
            More GIFs
          </button>
        )}
        {!loading && !error && gifs.length === 0 && <p className="py-6 text-center text-sm text-muted">No GIFs found.</p>}
        <p className="pt-3 pb-1 text-center text-[10px] font-semibold tracking-wide text-muted uppercase">Powered by GIPHY</p>
      </div>
    </div>
  );
}
