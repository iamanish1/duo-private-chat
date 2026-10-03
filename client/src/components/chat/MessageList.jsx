import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { DateDivider } from './DateDivider';
import { TypingIndicator } from './TypingIndicator';
import { EmptyChat } from './EmptyChat';
import { Spinner } from '../common/Spinner';
import { useChatStore } from '../../store/chatStore';
import { loadOlder, setViewportAtBottom } from '../../services/chatActions';
import { isSameDay } from '../../utils/format';

const BOTTOM_THRESHOLD = 96;
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function MessageList({ onActions, onOpenMedia, jumpRequest, onJump }) {
  const messages = useChatStore((s) => s.messages);
  const me = useChatStore((s) => s.me);
  const peer = useChatStore((s) => s.peer);
  const hasMore = useChatStore((s) => s.hasMore);
  const loadingOlder = useChatStore((s) => s.loadingOlder);
  const peerTyping = useChatStore((s) => s.peerTyping);
  const uploads = useChatStore((s) => s.uploads);
  const setReplyTo = useChatStore((s) => s.setReplyTo);

  const scrollRef = useRef(null);
  const topSentinel = useRef(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [highlightId, setHighlightId] = useState(null);

  // Snapshot of the scroll metrics before this render's DOM update, used to
  // keep the viewport steady when older messages are prepended.
  const snapshot = useRef(null);
  const el = scrollRef.current;
  if (el) snapshot.current = { height: el.scrollHeight, top: el.scrollTop };
  const firstId = messages[0]?.clientId ?? messages[0]?.id;
  const last = messages.at(-1);
  const lastKey = last ? last.clientId ?? last.id : null;
  const prev = useRef({ firstId, lastKey, count: 0 });

  const scrollToBottom = useCallback((behavior = 'auto') => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const before = prev.current;
    if (before.count === 0 && messages.length) {
      scrollToBottom();
    } else if (firstId !== before.firstId && lastKey === before.lastKey && snapshot.current) {
      node.scrollTop = snapshot.current.top + (node.scrollHeight - snapshot.current.height);
    } else if (lastKey !== before.lastKey && last) {
      const mine = last.senderId === me?.id;
      if (mine || atBottom.current) scrollToBottom(mine ? 'auto' : 'smooth');
      else setUnseen((n) => n + 1);
    }
    prev.current = { firstId, lastKey, count: messages.length };
  }, [messages, firstId, lastKey, last, me?.id, scrollToBottom]);

  // Keyboard open/close and layout changes: stay pinned if we were at the bottom.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(() => atBottom.current && scrollToBottom());
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  useEffect(() => {
    if (peerTyping && atBottom.current) scrollToBottom('smooth');
  }, [peerTyping, scrollToBottom]);

  // Infinite scroll upward.
  useEffect(() => {
    const node = topSentinel.current;
    if (!node || !hasMore) return undefined;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && loadOlder(), {
      root: scrollRef.current,
      rootMargin: '400px 0px 0px 0px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, messages.length]);

  const onScroll = () => {
    const node = scrollRef.current;
    const bottom = node.scrollHeight - node.scrollTop - node.clientHeight < BOTTOM_THRESHOLD;
    if (bottom !== atBottom.current) {
      atBottom.current = bottom;
      setViewportAtBottom(bottom);
    }
    setShowJump(!bottom);
    if (bottom) setUnseen(0);
  };

  // Jump to a specific message (reply quote tap, search result).
  useEffect(() => {
    if (!jumpRequest) return undefined;
    const target = document.getElementById(`msg-${jumpRequest.id}`);
    if (!target) return undefined;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlightId(jumpRequest.id);
    const timer = setTimeout(() => setHighlightId(null), 1600);
    return () => clearTimeout(timer);
  }, [jumpRequest, messages.length]);

  const rows = useMemo(
    () =>
      messages.map((m, i) => {
        const previous = messages[i - 1];
        const newDay = !previous || !isSameDay(previous.createdAt, m.createdAt);
        const grouped =
          !newDay && previous.senderId === m.senderId && new Date(m.createdAt) - new Date(previous.createdAt) < GROUP_WINDOW_MS;
        return { message: m, newDay, first: !grouped };
      }),
    [messages],
  );

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="scroll-area chat-backdrop absolute inset-0 [overflow-anchor:none]">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col pb-2">
          <div ref={topSentinel} className="h-px" />
          {loadingOlder && (
            <div className="flex justify-center py-3 text-muted">
              <Spinner size={18} />
            </div>
          )}
          {!hasMore && messages.length > 0 && (
            <p className="px-6 pt-6 pb-2 text-center text-xs text-muted">This is the beginning of your story together.</p>
          )}
          {messages.length === 0 ? (
            <EmptyChat peer={peer} />
          ) : (
            <div className="mt-auto">
              {rows.map(({ message, newDay, first }) => (
                <Fragment key={message.clientId ?? message.id}>
                  {newDay && <DateDivider date={message.createdAt} />}
                  <MessageBubble
                    message={message}
                    mine={message.senderId === me?.id}
                    first={first}
                    me={me}
                    peer={peer}
                    upload={message.clientId ? uploads[message.clientId] : undefined}
                    highlighted={highlightId === message.id}
                    onActions={onActions}
                    onReply={setReplyTo}
                    onOpenMedia={onOpenMedia}
                    onJump={onJump}
                  />
                </Fragment>
              ))}
            </div>
          )}
          {peerTyping && <TypingIndicator name={peer?.name} />}
        </div>
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute right-4 bottom-4 flex size-11 animate-pop items-center justify-center rounded-full border border-line bg-surface text-ink shadow-float"
          aria-label={unseen ? `${unseen} new messages, scroll to latest` : 'Scroll to latest'}
        >
          <ChevronDown size={22} />
          {unseen > 0 && (
            <span className="absolute -top-1.5 -right-1 min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] leading-5 font-bold text-on-accent">
              {unseen}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
