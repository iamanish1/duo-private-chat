import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { resolveUrl } from '../../utils/url';

/** Full-screen player using native controls (play/pause/seek/fullscreen/PiP). */
export function VideoPlayer({ src, poster, caption, onClose }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    videoRef.current?.play().catch(() => {
      // Autoplay with sound can be blocked; controls remain available.
    });
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex animate-fade-in flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Video">
      <div className="absolute inset-x-0 top-0 z-10 flex justify-end px-3 pt-safe">
        <IconButton label="Close" variant="glass" onClick={onClose} className="mt-3">
          <X size={22} />
        </IconButton>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <video
          ref={videoRef}
          src={resolveUrl(src)}
          poster={resolveUrl(poster) || undefined}
          controls
          playsInline
          preload="metadata"
          className="max-h-full w-full max-w-full"
        />
      </div>
      {caption && <p className="mx-auto max-w-2xl px-6 pt-3 pb-[calc(var(--safe-bottom)+20px)] text-center text-[15px] text-white/90">{caption}</p>}
    </div>,
    document.body,
  );
}
