import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Palette, SendHorizontal, X } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { Spinner } from '../common/Spinner';
import { postTextStatus } from '../../services/statusActions';
import { STATUS, STATUS_BACKGROUNDS } from '../../config';

const textSize = (text) => (text.length < 40 ? 'text-4xl' : text.length < 140 ? 'text-2xl' : 'text-xl');

/** Full-screen coloured card for writing a text status. */
export function TextStatusComposer({ onClose }) {
  const [text, setText] = useState('');
  const [background, setBackground] = useState(() => Math.floor(Math.random() * STATUS_BACKGROUNDS.length));
  const [posting, setPosting] = useState(false);
  const inputRef = useRef(null);

  // Grow with the text so it stays centred like the finished card.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const post = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    if (await postTextStatus(text, background)) onClose();
    else setPosting(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in flex-col text-white transition-[background] duration-300"
      style={{ background: STATUS_BACKGROUNDS[background] }}
      role="dialog"
      aria-modal="true"
      aria-label="New text status"
    >
      <div className="flex items-center justify-between px-3 pt-[calc(var(--safe-top)+12px)]">
        <IconButton label="Cancel" variant="glass" onClick={onClose}>
          <X size={22} />
        </IconButton>
        <IconButton label="Change colour" variant="glass" onClick={() => setBackground((b) => (b + 1) % STATUS_BACKGROUNDS.length)}>
          <Palette size={21} />
        </IconButton>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-8" onClick={() => inputRef.current?.focus()}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, STATUS.textLength))}
          autoFocus
          rows={1}
          placeholder="Type a status"
          aria-label="Status text"
          className={`w-full max-w-xl resize-none overflow-hidden bg-transparent text-center leading-snug font-semibold text-white placeholder:text-white/60 focus:outline-none ${textSize(text)}`}
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pb-[calc(var(--safe-bottom)+16px)]">
        <span className="text-xs text-white/75">
          {text.length > STATUS.textLength - 100 ? `${STATUS.textLength - text.length} characters left` : 'Disappears after 24 hours'}
        </span>
        <IconButton label="Post status" variant="glass-active" size="lg" onClick={post} disabled={!text.trim() || posting}>
          {posting ? <Spinner size={20} /> : <SendHorizontal size={22} />}
        </IconButton>
      </div>
    </div>,
    document.body,
  );
}
