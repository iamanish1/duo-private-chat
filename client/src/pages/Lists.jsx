import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { PageLayout } from '../components/common/PageLayout';
import { IconButton } from '../components/common/IconButton';
import { BottomSheet, SheetAction } from '../components/common/BottomSheet';
import { useChatStore } from '../store/chatStore';
import { addItem, createList, deleteList, editItem, removeItem, renameList, toggleItem, useCloseStore } from '../services/closeActions';
import { startWatching } from '../services/watchActions';
import { parseYouTubeId } from '../utils/youtube';

const SUGGESTIONS = [
  { name: 'Bucket list', emoji: '🌍' },
  { name: 'Movies to watch', emoji: '🎬' },
  { name: 'Date ideas', emoji: '💡' },
  { name: 'Places to visit', emoji: '📍' },
  { name: 'Shopping', emoji: '🛒' },
];
const EMOJIS = ['📝', '🌍', '🎬', '💡', '📍', '🛒', '🍕', '🎁', '📚', '🎵', '✈️', '❤️'];

function ListEditor({ list, onClose }) {
  const [name, setName] = useState(list?.name ?? '');
  const [emoji, setEmoji] = useState(list?.emoji ?? '📝');
  return (
    <BottomSheet open onClose={onClose} title={list ? 'Rename list' : 'New list'}>
      <form
        className="space-y-4 px-5 pb-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const ok = list ? await renameList(list.id, { name: name.trim(), emoji }) : await createList(name.trim(), emoji);
          if (ok) onClose(list ? null : ok.list);
        }}
      >
        <div className="flex flex-wrap gap-1.5">
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => setEmoji(e)} className={`size-10 rounded-full text-xl ${emoji === e ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface-2'}`} aria-label={`Icon ${e}`}>
              {e}
            </button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} autoFocus placeholder="List name" aria-label="List name" className="h-11 w-full rounded-2xl border border-line bg-surface px-4 focus:border-accent/50 focus:outline-none" />
        <button type="submit" disabled={!name.trim()} className="w-full rounded-full bg-accent py-3 font-semibold text-on-accent disabled:opacity-50">
          {list ? 'Save' : 'Create'}
        </button>
      </form>
    </BottomSheet>
  );
}

function ListDetail({ list, onBack }) {
  const navigate = useNavigate();
  const me = useChatStore((s) => s.me);
  const peer = useChatStore((s) => s.peer);
  const [text, setText] = useState('');
  const [menuFor, setMenuFor] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editText, setEditText] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameOf = (id) => (id === me?.id ? 'you' : peer?.name);
  const todo = list.items.filter((i) => !i.done);
  const done = list.items.filter((i) => i.done);

  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    if (!(await addItem(list.id, value))) setText(value);
  };

  const watch = async (videoId) => {
    if (await startWatching(videoId)) navigate('/watch');
  };

  const Row = ({ item }) => {
    const videoId = parseYouTubeId(item.text.split(/\s+/).find((w) => parseYouTubeId(w)) ?? '');
    return (
      <li className="flex items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-surface-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={item.done}
          aria-label={`${item.done ? 'Untick' : 'Tick'} ${item.text}`}
          onClick={() => toggleItem(list, item)}
          className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition ${item.done ? 'border-accent bg-accent text-on-accent' : 'border-line'}`}
        >
          {item.done && <Check size={15} strokeWidth={3} />}
        </button>
        {editingItem === item.id ? (
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (editText.trim() && (await editItem(list.id, item.id, editText.trim()))) setEditingItem(null);
            }}
          >
            <input value={editText} onChange={(e) => setEditText(e.target.value.slice(0, 200))} autoFocus aria-label="Edit item" className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 focus:outline-none" />
            <IconButton label="Cancel" size="sm" variant="muted" onClick={() => setEditingItem(null)}>
              <X size={16} />
            </IconButton>
          </form>
        ) : (
          <button type="button" onClick={() => setMenuFor(item)} className="min-w-0 flex-1 text-left">
            <span className={`block break-words ${item.done ? 'text-muted line-through' : ''}`}>{item.text}</span>
            <span className="block text-[11px] text-muted">{item.done ? `Done by ${nameOf(item.doneBy)}` : `Added by ${nameOf(item.addedBy)}`}</span>
          </button>
        )}
        {videoId && !item.done && (
          <button type="button" onClick={() => watch(videoId)} className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-strong">
            <Play size={12} fill="currentColor" /> Watch together
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="px-3 pt-2 pb-28">
      <div className="flex items-center gap-1">
        <IconButton label="All lists" onClick={onBack}>
          <ArrowLeft size={20} />
        </IconButton>
        <h2 className="min-w-0 flex-1 truncate px-1 text-lg font-semibold">
          {list.emoji} {list.name}
        </h2>
        <IconButton label="Rename list" variant="muted" onClick={() => setRenaming(true)}>
          <Pencil size={17} />
        </IconButton>
        <IconButton label="Delete list" variant="muted" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={17} />
        </IconButton>
      </div>
      <ul className="mt-2">
        {todo.map((i) => (
          <Row key={i.id} item={i} />
        ))}
        {list.items.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">Nothing here yet — add the first one below.</p>}
      </ul>
      {done.length > 0 && (
        <>
          <h3 className="mt-4 px-3 text-xs font-semibold tracking-wide text-muted uppercase">Done ({done.length})</h3>
          <ul className="mt-1">
            {done.map((i) => (
              <Row key={i.id} item={i} />
            ))}
          </ul>
        </>
      )}

      <form onSubmit={submit} className="glass fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-line px-3 pt-2.5 pb-[calc(var(--safe-bottom)+10px)]">
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 200))} placeholder="Add an item…" aria-label="Add an item" className="mx-auto h-11 w-full max-w-2xl min-w-0 flex-1 rounded-full border border-line bg-surface px-4 focus:border-accent/50 focus:outline-none" />
        <IconButton label="Add" variant="accent" type="submit" disabled={!text.trim()}>
          <Plus size={20} />
        </IconButton>
      </form>

      {menuFor && (
        <BottomSheet open onClose={() => setMenuFor(null)} title={menuFor.text}>
          <SheetAction icon={Check} label={menuFor.done ? 'Mark as not done' : 'Mark as done'} onClick={() => { toggleItem(list, menuFor); setMenuFor(null); }} />
          <SheetAction icon={Pencil} label="Edit" onClick={() => { setEditingItem(menuFor.id); setEditText(menuFor.text); setMenuFor(null); }} />
          <SheetAction icon={Trash2} label="Delete" tone="danger" onClick={() => { removeItem(list.id, menuFor.id); setMenuFor(null); }} />
        </BottomSheet>
      )}
      {renaming && <ListEditor list={list} onClose={() => setRenaming(false)} />}
      <BottomSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this list?">
        <div className="px-6 pb-2">
          <p className="text-sm text-muted">“{list.name}” and its {list.items.length} items are deleted for both of you.</p>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 rounded-full bg-surface-2 py-3 font-semibold">
              Cancel
            </button>
            <button type="button" onClick={async () => { setConfirmDelete(false); if (await deleteList(list.id)) onBack(); }} className="flex-1 rounded-full bg-danger py-3 font-semibold text-white">
              Delete
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

/** Lists you share: bucket list, movies to watch, date ideas… */
export default function Lists() {
  const lists = useCloseStore((s) => s.lists);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const open = lists.find((l) => l.id === openId);

  return (
    <PageLayout title="Our lists">
      {open ? (
        <ListDetail list={open} onBack={() => setOpenId(null)} />
      ) : (
        <div className="px-3 pt-3 pb-10">
          <ul className="grid gap-2 sm:grid-cols-2">
            {lists.map((l) => {
              const doneCount = l.items.filter((i) => i.done).length;
              return (
                <li key={l.id}>
                  <button type="button" onClick={() => setOpenId(l.id)} className="flex w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3.5 text-left transition hover:brightness-95">
                    <span className="text-2xl">{l.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{l.name}</span>
                      <span className="block text-xs text-muted">{l.items.length ? `${doneCount}/${l.items.length} done` : 'Empty'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-line px-4 py-3.5 font-semibold text-accent-strong">
                <Plus size={20} /> New list
              </button>
            </li>
          </ul>
          {lists.length === 0 && (
            <section className="mt-6">
              <h2 className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">Start with</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s.name} type="button" onClick={async () => { const r = await createList(s.name, s.emoji); if (r) setOpenId(r.list.id); }} className="rounded-full bg-accent-soft px-4 py-2 text-sm font-semibold text-accent-strong">
                    {s.emoji} {s.name}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      {creating && (
        <ListEditor
          onClose={(created) => {
            setCreating(false);
            if (created) setOpenId(created.id);
          }}
        />
      )}
    </PageLayout>
  );
}
