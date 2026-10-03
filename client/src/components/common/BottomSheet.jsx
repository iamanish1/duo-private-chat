import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DISMISS_DISTANCE = 90;

/**
 * Mobile bottom sheet (centered dialog on wide screens). Drag the handle
 * down to dismiss; Escape and backdrop taps close it too.
 */
export function BottomSheet({ open, onClose, title, children, className = '' }) {
  const panelRef = useRef(null);
  const drag = useRef(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    setOffset(0);
    const previouslyFocused = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;

  const onPointerDown = (e) => {
    drag.current = { y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (drag.current?.id === e.pointerId) setOffset(Math.max(0, e.clientY - drag.current.y));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (offset > DISMISS_DISTANCE) onClose();
    else setOffset(0);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ transform: offset ? `translateY(${offset}px)` : undefined, transition: drag.current ? 'none' : undefined }}
        className={`relative w-full max-w-lg animate-sheet-up rounded-t-[28px] bg-surface pb-safe shadow-float outline-none transition-transform duration-200 sm:rounded-[28px] sm:pb-0 ${className}`}
      >
        <div
          className="flex cursor-grab touch-none justify-center pt-3 pb-2 active:cursor-grabbing sm:hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="h-1.5 w-10 rounded-full bg-line" />
        </div>
        {title && <h2 className="px-6 pt-1 pb-3 text-base font-semibold sm:pt-6">{title}</h2>}
        <div className="max-h-[75vh] overflow-y-auto overscroll-contain pb-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function SheetAction({ icon: Icon, label, description, onClick, tone = 'default', disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-4 px-6 py-3.5 text-left transition hover:bg-surface-2 active:bg-surface-2 disabled:opacity-40 ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}
    >
      {Icon && (
        <span className={`flex size-10 items-center justify-center rounded-2xl ${tone === 'danger' ? 'bg-danger/10' : 'bg-surface-2'}`}>
          <Icon size={20} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
    </button>
  );
}
