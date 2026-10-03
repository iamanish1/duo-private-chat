import { memo, useState } from 'react';
import { Ban, Reply } from 'lucide-react';
import { MessageStatus } from './MessageStatus';
import { MediaContent } from './MediaContent';
import { VoiceNote } from './VoiceNote';
import { ReplyQuote } from './ReplyQuote';
import { RichText } from './RichText';
import { useBubbleGestures } from '../../hooks/useBubbleGestures';
import { isEmojiOnly } from '../../utils/emoji';
import { formatTime } from '../../utils/format';

function Reactions({ reactions, mine }) {
  if (!reactions?.length) return null;
  const counts = reactions.reduce((acc, r) => ({ ...acc, [r.emoji]: (acc[r.emoji] || 0) + 1 }), {});
  return (
    <div className={`relative z-[1] -mt-2 flex ${mine ? 'justify-end pr-2' : 'justify-start pl-2'}`}>
      <span className="flex animate-pop items-center gap-0.5 rounded-full border border-line bg-surface px-1.5 py-0.5 text-sm shadow-soft">
        {Object.entries(counts).map(([emoji, count]) => (
          <span key={emoji} className="flex items-center">
            {emoji}
            {count > 1 && <span className="ml-0.5 text-[11px] font-semibold text-muted">{count}</span>}
          </span>
        ))}
      </span>
    </div>
  );
}

// The tail corner sits on the sender's side; grouped bubbles tuck in toward each other.
function bubbleShape(mine, first) {
  if (mine) return `rounded-[20px] rounded-br-md ${first ? '' : 'rounded-tr-md'}`;
  return `rounded-[20px] rounded-bl-md ${first ? '' : 'rounded-tl-md'}`;
}

export const MessageBubble = memo(function MessageBubble({
  message, mine, first, me, peer, upload, highlighted, onActions, onReply, onOpenMedia, onJump,
}) {
  const { handlers, offset, replyReady } = useBubbleGestures({
    enabled: !message.deleted,
    onLongPress: () => onActions(message),
    onSwipeReply: message.id && !message.deleted ? () => onReply(message) : undefined,
  });

  // Animate only messages that arrive while the chat is open, not history.
  const [fresh] = useState(() => Date.now() - new Date(message.createdAt).getTime() < 10_000);
  const time = formatTime(message.createdAt);
  const isMedia = (message.type === 'image' || message.type === 'video') && !message.deleted;
  const bigEmoji = message.type === 'text' && !message.replyTo && isEmojiOnly(message.text);
  const statusIcon = mine && !message.deleted ? <MessageStatus status={message.status} onMedia={isMedia && !message.text} /> : null;
  const replyAuthor = message.replyTo ? (message.replyTo.senderId === me?.id ? 'You' : peer?.name) : null;

  const meta = (
    <span className={`inline-flex items-center gap-1 text-[11px] leading-none ${mine ? 'text-on-accent/75' : 'text-muted'}`}>
      {time}
      {statusIcon}
    </span>
  );

  let body;
  if (message.deleted) {
    body = (
      <div className={`flex items-center gap-2 border px-3.5 py-2 text-[15px] italic ${bubbleShape(mine, first)} ${mine ? 'border-transparent bg-bubble-out/60 text-on-accent/85' : 'border-line bg-bubble-in text-muted'}`}>
        <Ban size={15} /> {mine ? 'You deleted this message' : 'This message was deleted'}
        <span className="ml-1 text-[11px] not-italic opacity-70">{time}</span>
      </div>
    );
  } else if (bigEmoji) {
    body = (
      <div className="px-1">
        <p className="text-[44px] leading-tight">{message.text}</p>
        <div className={`flex ${mine ? 'justify-end' : ''}`}>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
            {time}
            {mine && <MessageStatus status={message.status} onMedia />}
          </span>
        </div>
      </div>
    );
  } else {
    body = (
      <div
        className={`${bubbleShape(mine, first)} ${isMedia ? 'p-1' : 'px-3.5 py-2'} shadow-soft ${
          mine ? 'bg-bubble-out text-on-accent' : 'border border-line bg-bubble-in text-ink'
        }`}
      >
        {message.replyTo && (
          <div className={isMedia ? 'px-0 pt-0' : '-mx-1.5 -mt-0.5'}>
            <ReplyQuote reply={message.replyTo} authorName={replyAuthor} mine={mine} onClick={() => onJump(message.replyTo.id)} />
          </div>
        )}
        {isMedia && <MediaContent message={message} upload={upload} onOpen={onOpenMedia} meta={!message.text ? <>{time}{statusIcon}</> : null} />}
        {message.type === 'audio' && (
          <>
            <VoiceNote message={message} mine={mine} upload={upload} />
            <div className="-mt-3.5 flex justify-end">{meta}</div>
          </>
        )}
        {message.text && (
          <p className={`text-[15.5px] leading-snug break-words whitespace-pre-wrap ${isMedia ? 'px-2.5 pt-1.5 pb-1' : ''}`}>
            <RichText text={message.text} linkClassName={mine ? 'text-on-accent' : 'text-accent-strong'} />
            <span className="float-right mt-1.5 ml-2.5 translate-y-0.5">{meta}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      id={message.id ? `msg-${message.id}` : undefined}
      className={`group relative flex px-3 ${mine ? 'justify-end' : 'justify-start'} ${first ? 'mt-2' : 'mt-0.5'} ${message.reactions?.length ? 'mb-2' : ''}`}
    >
      {offset > 0 && (
        <span
          className={`absolute top-1/2 left-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full transition ${replyReady ? 'scale-100 bg-accent text-on-accent' : 'scale-75 bg-surface-2 text-muted'}`}
          style={{ opacity: Math.min(1, offset / 40) }}
          aria-hidden="true"
        >
          <Reply size={16} />
        </span>
      )}
      <div
        {...handlers}
        className={`relative max-w-[82%] touch-pan-y select-none sm:max-w-[70%] lg:max-w-[62%] [@media(pointer:fine)]:select-text ${message.status === 'sending' && message.type === 'text' ? 'opacity-80' : ''} ${
          highlighted ? 'rounded-[22px] ring-2 ring-accent ring-offset-2 ring-offset-canvas' : ''
        } ${fresh ? 'animate-message-in' : ''}`}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined, transition: offset ? 'none' : 'transform 200ms ease' }}
      >
        {body}
        <Reactions reactions={message.reactions} mine={mine} />
        {message.status === 'failed' && message.type === 'text' && (
          <button type="button" onClick={() => onActions(message)} className="mt-1 block w-full text-right text-xs font-semibold text-danger">
            Not sent · Tap for options
          </button>
        )}
      </div>
    </div>
  );
});
