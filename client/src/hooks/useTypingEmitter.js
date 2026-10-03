import { useCallback, useEffect, useRef } from 'react';
import { emit } from '../services/socket';

const START_THROTTLE_MS = 2500;
const STOP_AFTER_IDLE_MS = 3000;

/** Throttled typing:start while typing, typing:stop after idle/send/blur/unmount. */
export function useTypingEmitter() {
  const lastStart = useRef(0);
  const idleTimer = useRef(null);
  const typing = useRef(false);

  const stop = useCallback(() => {
    clearTimeout(idleTimer.current);
    if (!typing.current) return;
    typing.current = false;
    lastStart.current = 0;
    emit('typing:stop');
  }, []);

  const onType = useCallback(() => {
    const now = Date.now();
    if (now - lastStart.current > START_THROTTLE_MS) {
      lastStart.current = now;
      typing.current = true;
      emit('typing:start');
    }
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stop, STOP_AFTER_IDLE_MS);
  }, [stop]);

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && stop();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      stop();
    };
  }, [stop]);

  return { onType, stop };
}
