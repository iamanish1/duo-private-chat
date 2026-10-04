import { useEffect, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { describeMessage } from '../chat/ReplyQuote';
import { useChatStore } from '../../store/chatStore';
import { sendText } from '../../services/chatActions';
import { formatTime } from '../../utils/format';
import { LIMITS } from '../../config';

const RECENT = 40;

/** The normal conversation, compact, beside the video. */
export function WatchChat({ emptyText = 'Say something about the video 💬' }) {
  const messages = useChatStore((s) => s.messages);
  const me = useChatStore((s) => s.me);
  const ready = useChatStore((s) => s.status === 'ready');
  const [text, setText] = useState('');
  const endRef = useRef(null);
  const recent = messages.slice(-RECENT);
  const lastId = recent.at(-1)?.clientId ?? recent.at(-1)?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lastId]);

  const submit = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || !ready) return;
    sendText(value);
    setText('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-area min-h-0 flex-1 space-y-1.5 px-3 py-3" aria-live="polite">
        {recent.length === 0 && <p className="py-6 text-center text-sm text-muted">{emptyText}</p>}
        {recent.map((m) => {
          const mine = m.senderId === me?.id;
          return (
            <div key={m.clientId ?? m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-[14.5px] leading-snug break-words whitespace-pre-wrap ${
                  mine ? 'rounded-br-md bg-bubble-out text-on-accent' : 'rounded-bl-md border border-line bg-bubble-in'
                } ${m.deleted ? 'italic opacity-70' : ''}`}
              >
                {m.statusReply ? '↩︎ Status · ' : ''}
                {describeMessage(m)}
                <span className={`ml-2 text-[10.5px] ${mine ? 'text-on-accent/70' : 'text-muted'}`}>{formatTime(m.createdAt)}</span>
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line px-2 pt-2 pb-[calc(var(--safe-bottom)+8px)]">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, LIMITS.textLength))}
          placeholder="Message"
          aria-label="Message while watching"
          enterKeyHint="send"
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 focus:border-accent/50 focus:outline-none"
        />
        <IconButton label="Send" variant="accent" type="submit" disabled={!text.trim() || !ready} onPointerDown={(e) => e.preventDefault()}>
          <SendHorizontal size={19} />
        </IconButton>
      </form>
    </div>
  );
}
