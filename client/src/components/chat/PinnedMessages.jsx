import { useState } from 'react';
import { ChevronRight, Pencil, Pin, PinOff } from 'lucide-react';
import { BottomSheet } from '../common/BottomSheet';
import { describeMessage } from './ReplyQuote';
import { usePinStore, pinMessage, unpinMessage } from '../../services/pinActions';
import { useChatStore } from '../../store/chatStore';
import { formatDayLabel } from '../../utils/format';

const label = (m) => m.pin.title || describeMessage(m);

/** A slim bar under the header: the newest pin, and how many there are. Tap → all pins. */
export function PinnedBar({ onJump }) {
  const pinned = usePinStore((s) => s.pinned);
  const [open, setOpen] = useState(false);
  if (!pinned.length) return null;
  const latest = pinned[0];

  return (
    <>
      <div className="glass relative z-[5] border-b border-line">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-2 text-left"
          aria-label={`Pinned messages (${pinned.length})`}
        >
          <Pin size={16} className="shrink-0 rotate-45 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-accent-strong">{pinned.length === 1 ? 'Pinned message' : `${pinned.length} pinned messages`}</span>
            <span className="block truncate text-sm">{label(latest)}</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-muted" />
        </button>
      </div>
      <PinnedSheet
        open={open}
        onClose={() => setOpen(false)}
        onJump={(id) => {
          setOpen(false);
          onJump(id);
        }}
      />
    </>
  );
}

/** Every pinned message, newest first: tap to jump, rename, or unpin. */
export function PinnedSheet({ open, onClose, onJump }) {
  const pinned = usePinStore((s) => s.pinned);
  const me = useChatStore((s) => s.me);
  const peer = useChatStore((s) => s.peer);
  const [renaming, setRenaming] = useState(null);

  const who = (id) => (id === me?.id ? 'you' : peer?.name ?? '');
  const author = (m) => (m.senderId === me?.id ? 'You' : peer?.name ?? '');

  return (
    <BottomSheet open={open} onClose={onClose} title={`📌 Pinned messages · ${pinned.length}`}>
      <ul className="px-3">
        {pinned.map((m) => (
          <li key={m.id} className="group flex items-start gap-1 rounded-2xl px-1 hover:bg-surface-2">
            <button type="button" onClick={() => onJump(m.id)} className="min-w-0 flex-1 px-2 py-3 text-left">
              {m.pin.title && <p className="truncate font-semibold">{m.pin.title}</p>}
              <p className={`line-clamp-2 text-sm ${m.pin.title ? 'text-muted' : ''}`}>
                <span className="font-medium">{author(m)}: </span>
                {describeMessage(m)}
              </p>
              <p className="mt-1 text-xs text-muted">
                Pinned by {who(m.pin.by)} · {formatDayLabel(m.pin.at)}
              </p>
            </button>
            <div className="flex shrink-0 items-center pt-2">
              <button type="button" onClick={() => setRenaming(m)} aria-label="Edit pin title" className="rounded-full p-2.5 text-muted hover:bg-surface hover:text-ink">
                <Pencil size={17} />
              </button>
              <button type="button" onClick={() => unpinMessage(m)} aria-label="Unpin" className="rounded-full p-2.5 text-muted hover:bg-surface hover:text-danger">
                <PinOff size={17} />
              </button>
            </div>
          </li>
        ))}
        {!pinned.length && <p className="px-3 py-8 text-center text-sm text-muted">Nothing pinned yet. Long-press a message and choose Pin.</p>}
      </ul>
      {renaming && <PinTitleSheet message={renaming} onClose={() => setRenaming(null)} />}
    </BottomSheet>
  );
}

/** Ask for an optional title when pinning (or renaming a pin). */
export function PinTitleSheet({ message, onClose }) {
  const [title, setTitle] = useState(message.pin?.title ?? '');
  const [saving, setSaving] = useState(false);
  const editing = Boolean(message.pin);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const ok = await pinMessage(message, title);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <BottomSheet open onClose={onClose} title={editing ? 'Edit pin title' : 'Pin message'}>
      <form onSubmit={save} className="px-6 pb-2">
        <p className="line-clamp-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">{describeMessage(message)}</p>
        <label htmlFor="pin-title" className="mt-4 block text-sm font-medium">
          Title <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="pin-title"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 60))}
          placeholder="e.g. Trip plan, Address, Wifi password"
          autoFocus
          autoComplete="off"
          className="mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 focus:border-accent/60 focus:outline-none"
        />
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-full bg-surface-2 py-3 font-semibold">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-3 font-semibold text-on-accent disabled:opacity-60">
            <Pin size={17} className="rotate-45" />
            {editing ? 'Save' : 'Pin'}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
