import { useCallback, useMemo, useState } from 'react';
import { Images } from 'lucide-react';
import { PageLayout } from '../components/common/PageLayout';
import { StateScreen } from '../components/common/StateScreen';
import { Spinner } from '../components/common/Spinner';
import { MediaGrid } from '../components/media/MediaGrid';
import { MediaViewer } from '../components/media/MediaViewer';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { chatApi } from '../services/api';

const TABS = [
  { id: 'image', label: 'Photos' },
  { id: 'video', label: 'Videos' },
];
const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

export default function Media() {
  const [tab, setTab] = useState('image');
  const [viewing, setViewing] = useState(null);
  const fetchPage = useCallback(
    (before) => chatApi.media({ type: tab, before }).then(({ messages, hasMore }) => ({ items: messages, hasMore })),
    [tab],
  );
  const { items, hasMore, loading, error, sentinelRef, reload } = usePaginatedList(fetchPage, tab);

  const months = useMemo(() => {
    const groups = [];
    for (const item of items) {
      const label = monthFormat.format(new Date(item.createdAt));
      if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
      groups.at(-1).items.push(item);
    }
    return groups;
  }, [items]);

  return (
    <PageLayout title="Photos & videos">
      <div className="sticky top-0 z-10 bg-canvas px-4 py-3">
        <div className="flex rounded-full bg-surface-2 p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-surface text-ink shadow-soft dark:bg-white/15' : 'text-muted'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && !items.length ? (
        <StateScreen title="Couldn't load media" description={error} action={{ label: 'Try again', onClick: reload }} className="py-24" />
      ) : !loading && !items.length ? (
        <StateScreen icon={Images} title={tab === 'image' ? 'No photos yet' : 'No videos yet'} description="Everything you share in the chat will appear here." className="py-24" />
      ) : (
        months.map((group) => (
          <section key={group.label} className="mb-4">
            <h2 className="px-4 pb-2 text-sm font-semibold text-muted">{group.label}</h2>
            <MediaGrid items={group.items} onOpen={setViewing} />
          </section>
        ))
      )}

      {loading && (
        <div className="flex justify-center py-8 text-muted">
          <Spinner />
        </div>
      )}
      {hasMore && <div ref={sentinelRef} className="h-px" />}
      {viewing && <MediaViewer message={viewing} onClose={() => setViewing(null)} />}
    </PageLayout>
  );
}
