import { useState } from 'react';
import { Copy, Plus, Reply, RotateCcw, Trash2 } from 'lucide-react';
import { BottomSheet, SheetAction } from '../common/BottomSheet';
import { EmojiPicker } from './EmojiPicker';
import { QUICK_REACTIONS } from '../../config';
import { deleteMessage, discardPending, reactToMessage, retryMessage } from '../../services/chatActions';
import { useChatStore } from '../../store/chatStore';
import { toast } from '../../store/toastStore';
import { formatDayLabel, formatTime } from '../../utils/format';

const stamp = (value) => `${formatDayLabel(value)}, ${formatTime(value)}`;

export function MessageActionsSheet({ message, onClose }) {
  const me = useChatStore((s) => s.me);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moreEmoji, setMoreEmoji] = useState(false);

  if (!message) return null;
  const mine = message.senderId === me?.id;
  const confirmed = Boolean(message.id) && message.status !== 'failed' && message.status !== 'sending';
  const myReaction = message.reactions?.find((r) => r.userId === me?.id)?.emoji;

  const run = (fn) => () => {
    fn();
    onClose();
  };

  const react = (emoji) => {
    reactToMessage(message, emoji);
    onClose();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      toast.show('Copied');
    } catch {
      toast.error("Couldn't copy on this device.");
    }
  };

  return (
    <BottomSheet open onClose={onClose} title={confirmDelete ? 'Delete this message?' : undefined}>
      {confirmDelete ? (
        <div className="px-6 pb-2">
          <p className="text-sm text-muted">It will be removed for both of you. This can't be undone.</p>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 rounded-full bg-surface-2 py-3 font-semibold">
              Cancel
            </button>
            <button type="button" onClick={run(() => deleteMessage(message))} className="flex-1 rounded-full bg-danger py-3 font-semibold text-white">
              Delete
            </button>
          </div>
        </div>
      ) : moreEmoji ? (
        <EmojiPicker onSelect={react} className="h-[50vh]" />
      ) : (
        <>
          {confirmed && !message.deleted && (
            <div className="flex items-center justify-between gap-1 px-5 pt-1 pb-3">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => react(emoji)}
                  aria-label={`React ${emoji}`}
                  aria-pressed={myReaction === emoji}
                  className={`flex size-12 items-center justify-center rounded-full text-[26px] transition active:scale-90 ${myReaction === emoji ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface-2 hover:scale-110'}`}
                >
                  {emoji}
                </button>
              ))}
              <button type="button" onClick={() => setMoreEmoji(true)} aria-label="More reactions" className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
                <Plus size={22} />
              </button>
            </div>
          )}

          {message.status === 'failed' && (
            <>
              <SheetAction icon={RotateCcw} label="Try again" description={message.error} onClick={run(() => retryMessage(message))} />
              <SheetAction icon={Trash2} label="Discard" tone="danger" onClick={run(() => discardPending(message.clientId))} />
            </>
          )}
          {confirmed && !message.deleted && <SheetAction icon={Reply} label="Reply" onClick={run(() => setReplyTo(message))} />}
          {message.text && !message.deleted && <SheetAction icon={Copy} label="Copy text" onClick={run(copy)} />}
          {mine && confirmed && !message.deleted && <SheetAction icon={Trash2} label="Delete for both" tone="danger" onClick={() => setConfirmDelete(true)} />}

          {confirmed && (
            <p className="px-6 pt-3 text-xs text-muted">
              {mine ? 'Sent' : 'Received'} {stamp(message.createdAt)}
              {mine && message.readAt && ` · Read ${stamp(message.readAt)}`}
              {mine && !message.readAt && message.deliveredAt && ` · Delivered ${stamp(message.deliveredAt)}`}
            </p>
          )}
        </>
      )}
    </BottomSheet>
  );
}
