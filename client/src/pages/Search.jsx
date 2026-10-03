import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Calendar, Search as SearchIcon, X } from 'lucide-react';
import { PageLayout } from '../components/common/PageLayout';
import { StateScreen } from '../components/common/StateScreen';
import { Spinner } from '../components/common/Spinner';
import { BottomSheet } from '../components/common/BottomSheet';
import { Avatar } from '../components/common/Avatar';
import { MediaViewer } from '../components/media/MediaViewer';
import { describeMessage } from '../components/chat/ReplyQuote';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { chatApi } from '../services/api';
import { useChatStore } from '../store/chatStore';
import { formatDayLabel, formatTime } from '../utils/format';
import { resolveUrl } from '../utils/url';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'text', label: 'Text' },
  { id: 'image', label: 'Photos' },
  { id: 'video', label: 'Videos' },
  { id: 'audio', label: 'Voice' },
];

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function Highlight({ text, query }) {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  // Show the match even in long messages.
  const start = Math.max(0, index - 40);
  return (
    <>
      {start > 0 && '…'}
      {text.slice(start, index)}
      <mark className="rounded bg-accent-soft px-0.5 text-accent-strong">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

// Date inputs are local calendar days; send exact instants so the server's timezone doesn't matter.
const startOfDay = (date) => (date ? new Date(`${date}T00:00:00`).toISOString() : undefined);
const endOfDay = (date) => (date ? new Date(`${date}T23:59:59.999`).toISOString() : undefined);

export default function Search() {
  const navigate = useNavigate();
  const me = useChatStore((s) => s.me);
  const peer = useChatStore((s) => s.peer);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [dateSheet, setDateSheet] = useState(false);
  const [viewing, setViewing] = useState(null);
  const q = useDebounced(query.trim());
  const active = Boolean(q || type || range.from || range.to);

  const fetchPage = useCallback(
    (before) => {
      if (!active) return Promise.resolve({ items: [], hasMore: false });
      return chatApi
        .search({ q: q || undefined, type: type || undefined, from: startOfDay(range.from), to: endOfDay(range.to), before })
        .then(({ messages, hasMore }) => ({ items: messages, hasMore }));
    },
    [active, q, type, range],
  );
  const { items, hasMore, loading, error, sentinelRef } = usePaginatedList(fetchPage, `${q}|${type}|${range.from}|${range.to}`);

  const open = (m) => (m.type === 'image' || m.type === 'video' ? setViewing(m) : navigate('/', { state: { focusMessageId: m.id } }));
  const dateLabel = range.from || range.to ? `${range.from || '…'} → ${range.to || '…'}` : 'Date';

  return (
    <PageLayout title="Search">
      <div className="sticky top-0 z-10 space-y-3 bg-canvas px-4 py-3">
        <div className="flex h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-4 shadow-soft focus-within:border-accent">
          <SearchIcon size={19} className="text-muted" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 100))}
            placeholder="Search your messages"
            className="min-w-0 flex-1 bg-transparent placeholder:text-muted focus:outline-none"
            aria-label="Search messages"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="rounded-full p-1 text-muted hover:bg-surface-2">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setType(f.id)}
              aria-pressed={type === f.id}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition ${type === f.id ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink'}`}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDateSheet(true)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium ${range.from || range.to ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface'}`}
          >
            <Calendar size={15} /> {dateLabel}
          </button>
        </div>
      </div>

      {!active ? (
        <StateScreen icon={SearchIcon} title="Find a moment" description="Search words, or filter by photos, videos and dates." className="py-24" />
      ) : error ? (
        <StateScreen title="Search failed" description={error} className="py-24" />
      ) : !loading && !items.length ? (
        <StateScreen title="No results" description="Try different words or a wider date range." className="py-24" />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((m) => {
            const author = m.senderId === me?.id ? me : peer;
            return (
              <li key={m.id}>
                <button type="button" onClick={() => open(m)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-2">
                  <Avatar user={author} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{m.senderId === me?.id ? 'You' : peer?.name}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {formatDayLabel(m.createdAt)} · {formatTime(m.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-[15px] text-ink/90">
                      {m.text ? <Highlight text={m.text} query={q} /> : <span className="text-muted">{describeMessage(m)}</span>}
                    </span>
                  </span>
                  {m.media?.thumbnailUrl && <img src={resolveUrl(m.media.thumbnailUrl)} alt="" loading="lazy" className="size-12 shrink-0 rounded-xl object-cover" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {loading && active && (
        <div className="flex justify-center py-8 text-muted">
          <Spinner />
        </div>
      )}
      {hasMore && <div ref={sentinelRef} className="h-px" />}

      <BottomSheet open={dateSheet} onClose={() => setDateSheet(false)} title="Filter by date">
        <div className="grid grid-cols-2 gap-3 px-6">
          {['from', 'to'].map((key) => (
            <label key={key} className="text-sm font-medium text-muted">
              {key === 'from' ? 'From' : 'To'}
              <input
                type="date"
                value={range[key]}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setRange((r) => ({ ...r, [key]: e.target.value }))}
                className="mt-1 h-12 w-full rounded-2xl border border-line bg-surface px-3 text-ink"
              />
            </label>
          ))}
        </div>
        <div className="mt-5 flex gap-3 px-6">
          <button type="button" onClick={() => setRange({ from: '', to: '' })} className="flex-1 rounded-full bg-surface-2 py-3 font-semibold">
            Clear
          </button>
          <button type="button" onClick={() => setDateSheet(false)} className="flex-1 rounded-full bg-accent py-3 font-semibold text-on-accent">
            Done
          </button>
        </div>
      </BottomSheet>

      {viewing && <MediaViewer message={viewing} onClose={() => setViewing(null)} />}
    </PageLayout>
  );
}
