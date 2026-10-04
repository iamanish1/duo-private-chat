import { useRef, useState } from 'react';
import { Camera, Eye, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageLayout } from '../components/common/PageLayout';
import { IconButton } from '../components/common/IconButton';
import { BottomSheet } from '../components/common/BottomSheet';
import { MediaPreviewSheet } from '../components/chat/MediaPreviewSheet';
import { StatusRing } from '../components/status/StatusRing';
import { StatusThumb } from '../components/status/StatusThumb';
import { TextStatusComposer } from '../components/status/TextStatusComposer';
import { useStatusesOf } from '../components/status/useStatuses';
import { useChatStore } from '../store/chatStore';
import { useStatusStore } from '../store/statusStore';
import { deleteStatus, postMediaStatus } from '../services/statusActions';
import { useNow } from '../hooks/useNow';
import { formatAgo, formatTime } from '../utils/format';
import { STATUS } from '../config';

const updates = (n) => `${n} update${n === 1 ? '' : 's'}`;

export default function Status() {
  const me = useChatStore((s) => s.me);
  const peer = useChatStore((s) => s.peer);
  const uploading = useStatusStore((s) => s.uploading);
  const openViewer = useStatusStore((s) => s.openViewer);
  const mine = useStatusesOf(me?.id);
  const theirs = useStatusesOf(peer?.id);
  const now = useNow();
  const fileRef = useRef(null);
  const [composing, setComposing] = useState(false);
  const [picked, setPicked] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const pickMedia = () => fileRef.current?.click();
  const unseen = theirs.filter((s) => !s.viewedAt).length;
  const latestMine = mine.at(-1);
  const latestTheirs = theirs.at(-1);

  return (
    <PageLayout
      title="Status"
      actions={
        <>
          <IconButton label="New text status" onClick={() => setComposing(true)}>
            <Pencil size={20} />
          </IconButton>
          <IconButton label="New photo or video status" onClick={pickMedia}>
            <Camera size={22} />
          </IconButton>
        </>
      }
    >
      {/* My status */}
      <section className="px-2 pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (mine.length ? openViewer(me.id) : pickMedia())}
            className="flex min-w-0 flex-1 items-center gap-4 rounded-2xl px-2 py-2.5 text-left transition hover:bg-surface-2"
            aria-label={mine.length ? 'View my status' : 'Add a status'}
          >
            <span className="relative">
              <StatusRing user={me} statuses={mine} size="lg" myId={me?.id} />
              {!mine.length && (
                <span className="absolute right-0 bottom-0 flex size-6 items-center justify-center rounded-full bg-accent text-on-accent ring-2 ring-canvas">
                  <Plus size={15} strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">My status</span>
              <span className="block truncate text-sm text-muted">
                {latestMine ? `${updates(mine.length)} · ${formatAgo(latestMine.createdAt, now)}` : 'Tap to add a photo or video'}
              </span>
            </span>
          </button>
          <IconButton label="Write a text status" variant="soft" onClick={() => setComposing(true)}>
            <Pencil size={19} />
          </IconButton>
          <IconButton label="Add a photo or video status" variant="accent" onClick={pickMedia} className="mr-2">
            <Camera size={20} />
          </IconButton>
        </div>

        {uploading && (
          <div className="mx-2 mt-2 flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3" role="status">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Posting your {uploading.kind === 'video' ? 'video' : 'photo'}…</span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(uploading.progress * 100)}%` }} />
              </span>
            </span>
            <span className="text-sm text-muted tabular-nums">{Math.round(uploading.progress * 100)}%</span>
          </div>
        )}

        {mine.length > 0 && (
          <ul className="mt-1">
            {[...mine].reverse().map((s) => (
              <li key={s.id} className="flex items-center gap-1">
                <button type="button" onClick={() => openViewer(me.id, s.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 pl-6 text-left transition hover:bg-surface-2">
                  <StatusThumb type={s.type} text={s.text} background={s.background} thumbnailUrl={s.media?.thumbnailUrl} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{formatAgo(s.createdAt, now)}</span>
                    <span className={`flex items-center gap-1.5 text-[13px] ${s.viewedAt ? 'text-accent-strong' : 'text-muted'}`}>
                      <Eye size={14} />
                      {s.viewedAt ? `Seen by ${peer?.name} · ${formatTime(s.viewedAt)}` : 'Not seen yet'}
                    </span>
                  </span>
                </button>
                <IconButton label="Delete status" variant="muted" onClick={() => setConfirm(s)} className="mr-2">
                  <Trash2 size={18} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Theirs */}
      <section className="mt-4 border-t border-line px-2 pt-4">
        <h2 className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{unseen ? 'New update' : 'Updates'}</h2>
        {theirs.length ? (
          <button type="button" onClick={() => openViewer(peer.id)} className="flex w-full items-center gap-4 rounded-2xl px-2 py-2.5 text-left transition hover:bg-surface-2" aria-label={`View ${peer?.name}'s status`}>
            <StatusRing user={peer} statuses={theirs} size="lg" myId={me?.id} />
            <span className="min-w-0">
              <span className="block font-semibold">{peer?.name}</span>
              <span className="block truncate text-sm text-muted">
                {unseen ? `${unseen} new · ` : ''}
                {formatAgo(latestTheirs.createdAt, now)}
              </span>
            </span>
          </button>
        ) : (
          <p className="px-2 py-6 text-center text-sm text-muted">No updates from {peer?.name ?? 'them'} in the last 24 hours.</p>
        )}
      </section>

      <p className="flex items-start justify-center gap-1.5 px-8 pt-8 pb-6 text-center text-xs text-muted">
        <Lock size={13} className="mt-0.5 shrink-0" />
        Your status is shared only with {peer?.name ?? 'the other person'} and disappears after 24 hours.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) setPicked([file]);
        }}
      />
      {composing && <TextStatusComposer onClose={() => setComposing(false)} />}
      {picked && (
        <MediaPreviewSheet
          files={picked}
          captionLength={STATUS.textLength}
          sendLabel="Post status"
          onCancel={() => setPicked(null)}
          onSend={(prepared, caption) => {
            setPicked(null);
            postMediaStatus(prepared[0], caption);
          }}
        />
      )}
      <BottomSheet open={Boolean(confirm)} onClose={() => setConfirm(null)} title="Delete this status?">
        <div className="px-6 pb-2">
          <p className="text-sm text-muted">{peer?.name} won't be able to see it anymore.</p>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setConfirm(null)} className="flex-1 rounded-full bg-surface-2 py-3 font-semibold">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                deleteStatus(confirm);
                setConfirm(null);
              }}
              className="flex-1 rounded-full bg-danger py-3 font-semibold text-white"
            >
              Delete
            </button>
          </div>
        </div>
      </BottomSheet>
    </PageLayout>
  );
}
