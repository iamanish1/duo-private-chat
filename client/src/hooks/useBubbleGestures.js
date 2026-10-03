import { useRef, useState } from 'react';

const LONG_PRESS_MS = 450;
const SWIPE_TRIGGER = 56;
const SWIPE_MAX = 80;

/**
 * Long-press (or right-click) opens actions; swiping a bubble right starts a
 * reply. Vertical movement is left to native scrolling (touch-action: pan-y).
 */
export function useBubbleGestures({ onLongPress, onSwipeReply, enabled = true }) {
  const state = useRef(null);
  const timer = useRef(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);

  const reset = () => {
    clearTimeout(timer.current);
    state.current = null;
    setOffset(0);
  };

  const handlers = {
    onPointerDown(e) {
      if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      suppressClick.current = false;
      state.current = { x: e.clientX, y: e.clientY, swiping: false, touch: e.pointerType !== 'mouse' };
      timer.current = setTimeout(() => {
        suppressClick.current = true;
        navigator.vibrate?.(8);
        onLongPress();
        state.current = null;
      }, LONG_PRESS_MS);
    },
    onPointerMove(e) {
      const s = state.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(timer.current);
      if (!s.swiping && Math.abs(dy) > 12) {
        reset();
        return;
      }
      if (s.touch && onSwipeReply && dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        s.swiping = true;
        setOffset(Math.min(SWIPE_MAX, dx * 0.7));
      }
    },
    onPointerUp() {
      const s = state.current;
      if (s?.swiping) {
        suppressClick.current = true;
        if (offset >= SWIPE_TRIGGER * 0.7) {
          navigator.vibrate?.(6);
          onSwipeReply();
        }
      }
      reset();
    },
    onPointerCancel: reset,
    onContextMenu(e) {
      e.preventDefault();
      if (!enabled || suppressClick.current) return;
      reset();
      onLongPress();
    },
    onClickCapture(e) {
      if (suppressClick.current) {
        e.stopPropagation();
        e.preventDefault();
        suppressClick.current = false;
      }
    },
  };

  return { handlers, offset, replyReady: offset >= SWIPE_TRIGGER * 0.7 };
}
