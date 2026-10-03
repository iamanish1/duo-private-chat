import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, Mic, Paperclip, SendHorizontal, Smile } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { EmojiPicker } from './EmojiPicker';
import { ReplyBar } from './ReplyBar';
import { AttachmentSheet } from './AttachmentSheet';
import { MediaPreviewSheet } from './MediaPreviewSheet';
import { VoiceRecorderBar } from './VoiceRecorderBar';
import { useChatStore } from '../../store/chatStore';
import { useTypingEmitter } from '../../hooks/useTypingEmitter';
import { sendMedia, sendText, sendVoice } from '../../services/chatActions';
import { voiceSupported } from '../../utils/voiceRecorder';
import { ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES, LIMITS } from '../../config';

const DRAFT_KEY = 'duo-draft';
const MAX_FILES = 10;
const PICKERS = {
  library: { accept: 'image/*,video/*', multiple: true },
  'camera-photo': { accept: 'image/*', capture: 'environment' },
  'camera-video': { accept: 'video/*', capture: 'environment' },
  files: { accept: [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES, '.heic', '.mov'].join(','), multiple: true },
};

const readDraft = () => {
  try {
    return sessionStorage.getItem(DRAFT_KEY) || '';
  } catch {
    return '';
  }
};

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

export function Composer({ onFirstSend }) {
  const replyTo = useChatStore((s) => s.replyTo);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const me = useChatStore((s) => s.me);
  const peer = useChatStore((s) => s.peer);
  const ready = useChatStore((s) => s.status === 'ready');

  const [text, setText] = useState(readDraft);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pickedFiles, setPickedFiles] = useState(null);
  const [recording, setRecording] = useState(false);
  const [canRecord] = useState(voiceSupported);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const { onType, stop } = useTypingEmitter();

  // Auto-grow the textarea up to ~6 lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`;
  }, [text]);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, text);
    } catch {
      // Draft persistence is optional.
    }
  }, [text]);

  useEffect(() => {
    if (replyTo && !isTouch()) inputRef.current?.focus();
  }, [replyTo]);

  const submit = useCallback(() => {
    const value = text.trim();
    if (!value || !ready) return;
    sendText(value);
    setText('');
    stop();
    onFirstSend?.();
  }, [text, ready, stop, onFirstSend]);

  const onKeyDown = (e) => {
    // Desktop: Enter sends, Shift+Enter breaks the line. Touch keyboards insert newlines.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) {
      e.preventDefault();
      submit();
    }
  };

  const insertEmoji = (emoji) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    if (next.length > LIMITS.textLength) return;
    setText(next);
    onType();
    requestAnimationFrame(() => {
      if (!el) return;
      const caret = start + emoji.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const toggleEmoji = () => {
    if (emojiOpen) {
      setEmojiOpen(false);
      inputRef.current?.focus();
    } else {
      inputRef.current?.blur(); // hide the keyboard; the panel takes its place
      setEmojiOpen(true);
    }
  };

  const openPicker = (kind) => {
    setAttachOpen(false);
    const input = fileRef.current;
    const config = PICKERS[kind];
    input.accept = config.accept;
    input.multiple = Boolean(config.multiple);
    if (config.capture) input.setAttribute('capture', config.capture);
    else input.removeAttribute('capture');
    input.click();
  };

  const onFiles = (fileList) => {
    const files = Array.from(fileList || []).slice(0, MAX_FILES);
    if (files.length) setPickedFiles(files);
  };

  const onPaste = (e) => {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => /^(image|video)\//.test(f.type));
    if (files.length) {
      e.preventDefault();
      onFiles(files);
    }
  };

  const hasText = text.trim().length > 0;
  const showMic = canRecord && !hasText;

  const startRecording = () => {
    setEmojiOpen(false);
    inputRef.current?.blur();
    stop();
    setRecording(true);
  };
  const closeRecorder = useCallback(() => setRecording(false), []);
  const onVoiceRecorded = useCallback(
    (recording) => {
      sendVoice(recording);
      onFirstSend?.();
    },
    [onFirstSend],
  );

  return (
    <div className="glass relative z-10 border-t border-line">
      {replyTo && <ReplyBar message={replyTo} authorName={replyTo.senderId === me?.id ? 'yourself' : peer?.name} onCancel={() => setReplyTo(null)} />}

      {recording ? (
        <VoiceRecorderBar onSend={onVoiceRecorded} onClose={closeRecorder} />
      ) : (
      <div className={`mx-auto flex max-w-3xl items-end gap-1.5 px-2 pt-2 ${emojiOpen ? 'pb-2' : 'pb-[calc(var(--safe-bottom)+8px)]'}`}>
        <IconButton label={emojiOpen ? 'Show keyboard' : 'Emoji'} variant="muted" onClick={toggleEmoji}>
          {emojiOpen ? <Keyboard size={22} /> : <Smile size={22} />}
        </IconButton>

        <div className="flex min-h-11 flex-1 items-end rounded-[22px] border border-line bg-surface transition focus-within:border-accent/50">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value.slice(0, LIMITS.textLength));
              onType();
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={() => setEmojiOpen(false)}
            onBlur={stop}
            rows={1}
            placeholder={ready ? 'Message' : 'Loading…'}
            disabled={!ready}
            enterKeyHint="enter"
            autoComplete="off"
            aria-label="Message"
            className="block max-h-[148px] min-h-11 w-full resize-none bg-transparent px-4 py-[10px] leading-6 placeholder:text-muted focus:outline-none"
          />
          {!hasText && (
            <div className="flex shrink-0 items-center pr-1 pb-0.5">
              <IconButton label="Attach photo or video" variant="muted" size="sm" onClick={() => setAttachOpen(true)} disabled={!ready}>
                <Paperclip size={20} />
              </IconButton>
              <IconButton label="Camera" variant="muted" size="sm" onClick={() => openPicker('camera-photo')} disabled={!ready}>
                <Camera size={20} />
              </IconButton>
            </div>
          )}
        </div>

        <IconButton
          label="Send"
          variant="accent"
          onPointerDown={(e) => e.preventDefault() /* keep the keyboard open */}
          onClick={submit}
          disabled={!hasText || !ready}
          className={`transition-all duration-200 ${hasText ? 'scale-100 opacity-100' : 'pointer-events-none w-0 scale-50 opacity-0'}`}
        >
          <SendHorizontal size={20} />
        </IconButton>
        {showMic && (
          <IconButton label="Record voice note" variant="accent" onClick={startRecording} disabled={!ready} className="animate-pop">
            <Mic size={21} />
          </IconButton>
        )}
      </div>
      )}

      {emojiOpen && <EmojiPicker onSelect={insertEmoji} className="h-[min(300px,40vh)] animate-sheet-up border-t border-line pb-safe" />}

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <AttachmentSheet open={attachOpen} onClose={() => setAttachOpen(false)} onPick={openPicker} />
      {pickedFiles && (
        <MediaPreviewSheet
          files={pickedFiles}
          onCancel={() => setPickedFiles(null)}
          onSend={(prepared, caption) => {
            prepared.forEach((item, i) => sendMedia(item, i === 0 ? caption : ''));
            setPickedFiles(null);
            onFirstSend?.();
          }}
        />
      )}
    </div>
  );
}
