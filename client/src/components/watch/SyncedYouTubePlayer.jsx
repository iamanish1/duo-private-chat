import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Hand, VolumeX } from 'lucide-react';
import { Spinner } from '../common/Spinner';
import { expectedPosition, useWatchStore } from '../../store/watchStore';
import { useChatStore } from '../../store/chatStore';
import { sendControl } from '../../services/watchActions';
import { describePlayerError, loadYouTubeApi } from '../../utils/youtube';

// YT.PlayerState
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;

const DRIFT_TOLERANCE_S = 2; // further apart than this and we jump to the shared spot
const SEEK_DETECT_S = 2.5; // a jump this big that we didn't cause is the user seeking
const TICK_MS = 1000;

/**
 * YouTube's own player, kept in step with the other person's. Local
 * play/pause/seek are sent to the server; remote ones are applied here.
 * While applying a remote change, the player's own events are ignored for a
 * moment so they don't bounce back.
 */
export function SyncedYouTubePlayer() {
  const room = useWatchStore((s) => s.room);
  const myId = useChatStore((s) => s.me?.id);
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [hint, setHint] = useState(null); // 'tap' | 'muted' | null

  const roomRef = useRef(room);
  roomRef.current = room;
  const suppressUntil = useRef(0);
  const lastLocalAction = useRef(0);
  const sample = useRef(null); // { time, at, playing }
  const loadedVideo = useRef(null);
  const startCheck = useRef(null);
  // What the last remote change asked for, and whether the player got there.
  // Once it has, an opposite play/pause is the person pressing the button.
  const target = useRef({ state: null, reached: true });

  const suppress = (ms = 1500) => {
    suppressUntil.current = Date.now() + ms;
    sample.current = null;
  };
  const offset = () => useWatchStore.getState().clockOffset;

  // Autoplay can be refused (mostly iPhone) or forced to mute; tell the person.
  const checkStarted = () => {
    clearTimeout(startCheck.current);
    startCheck.current = setTimeout(() => {
      const p = playerRef.current;
      if (!p?.getPlayerState || !roomRef.current?.playing) return;
      const state = p.getPlayerState();
      if (state !== PLAYING && state !== BUFFERING) setHint('tap');
      else if (p.isMuted?.()) setHint('muted');
    }, 2500);
  };

  /** Bring this player to the shared state. */
  const applyRoom = () => {
    const p = playerRef.current;
    const r = roomRef.current;
    if (!p?.getPlayerState || !r) return;
    target.current = { state: r.playing ? PLAYING : PAUSED, reached: false };
    const position = expectedPosition(r, offset());
    if (loadedVideo.current !== r.videoId) {
      loadedVideo.current = r.videoId;
      setError(null);
      suppress(3000);
      if (r.playing) p.loadVideoById({ videoId: r.videoId, startSeconds: position });
      else p.cueVideoById({ videoId: r.videoId, startSeconds: position });
      if (r.playing) checkStarted();
      return;
    }
    const state = p.getPlayerState();
    if (Math.abs((p.getCurrentTime() || 0) - position) > 1.2) {
      suppress();
      p.seekTo(position, true);
    }
    if (r.playing && state !== PLAYING && state !== BUFFERING) {
      suppress();
      p.playVideo();
      checkStarted();
    } else if (!r.playing && (state === PLAYING || state === BUFFERING)) {
      suppress();
      p.pauseVideo();
    }
  };
  const applyRef = useRef(applyRoom);
  applyRef.current = applyRoom;

  // Create the player once. YouTube replaces the element it's given, so it
  // gets a child React doesn't manage.
  useEffect(() => {
    let cancelled = false;
    const mount = document.createElement('div');
    hostRef.current.appendChild(mount);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        const r = roomRef.current;
        loadedVideo.current = r?.videoId ?? null;
        suppress(3000);
        playerRef.current = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          videoId: r?.videoId,
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: window.location.origin, start: Math.floor(expectedPosition(r, offset())) },
          events: {
            onReady: () => {
              if (cancelled) return;
              setReady(true);
              applyRef.current();
            },
            onStateChange: (e) => stateRef.current(e.data),
            onError: (e) => setError(describePlayerError(e.data)),
          },
        });
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
      clearTimeout(startCheck.current);
      playerRef.current?.destroy?.();
      playerRef.current = null;
      mount.remove();
    };
  }, []);

  // Local play / pause → tell the other person.
  const onState = (state) => {
    const p = playerRef.current;
    const r = roomRef.current;
    if (!p || !r) return;
    if (state === PLAYING) setHint(p.isMuted?.() && r.playing ? 'muted' : null);
    // Keep a reference point so a seek right after pausing is still noticed.
    sample.current = { time: p.getCurrentTime() || 0, at: Date.now(), playing: state === PLAYING };
    const settled = target.current.reached;
    if (state === target.current.state) target.current.reached = true;
    if (Date.now() < suppressUntil.current && !settled) return;
    const t = p.getCurrentTime() || 0;
    if (state === PLAYING && !r.playing) {
      lastLocalAction.current = Date.now();
      sendControl('play', t);
    } else if ((state === PAUSED || state === ENDED) && r.playing) {
      lastLocalAction.current = Date.now();
      sendControl('pause', t);
    }
  };
  const stateRef = useRef(onState);
  stateRef.current = onState;

  // Remote changes (and our first state) → apply.
  useEffect(() => {
    if (!ready || !room) return;
    if (room.changedBy === myId && loadedVideo.current === room.videoId) return;
    applyRef.current();
  }, [ready, room?.videoId, room?.playing, room?.position, room?.updatedAt]);

  // Every second: notice local seeks, and nudge back if we've drifted.
  useEffect(() => {
    if (!ready) return undefined;
    const timer = setInterval(() => {
      const p = playerRef.current;
      const r = roomRef.current;
      if (!p?.getPlayerState || !r || loadedVideo.current !== r.videoId) return;
      const state = p.getPlayerState();
      const t = p.getCurrentTime() || 0;
      const now = Date.now();
      const quiet = now > suppressUntil.current;
      const last = sample.current;
      if (quiet && last && state !== BUFFERING) {
        const predicted = last.time + (last.playing ? (now - last.at) / 1000 : 0);
        if (Math.abs(t - predicted) > SEEK_DETECT_S) {
          lastLocalAction.current = now;
          sendControl('seek', t);
          sample.current = { time: t, at: now, playing: state === PLAYING };
          return;
        }
      }
      sample.current = { time: t, at: now, playing: state === PLAYING };
      // Started playing while we were busy applying a change: share it.
      // (Never the reverse — a phone that refused to autoplay must not pause the other.)
      if (quiet && state === PLAYING && !r.playing) {
        lastLocalAction.current = now;
        sendControl('play', t);
        return;
      }
      if (quiet && r.playing && state === PLAYING && now - lastLocalAction.current > 3000) {
        const shared = expectedPosition(r, useWatchStore.getState().clockOffset);
        if (Math.abs(t - shared) > DRIFT_TOLERANCE_S) {
          suppress();
          p.seekTo(shared, true);
        }
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [ready]);

  return (
    <div className="relative size-full bg-black">
      <div ref={hostRef} className="absolute inset-0 [&>iframe]:size-full" data-testid="youtube-host" />
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-white/70">
          <Spinner />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/85 px-6 text-center text-sm text-white">
          <CircleAlert size={26} className="text-white/80" />
          {error}
        </div>
      )}
      {hint && !error && (
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-3">
          <span className="flex items-center gap-2 rounded-full bg-black/75 px-3.5 py-1.5 text-xs font-medium text-white shadow-float">
            {hint === 'tap' ? <Hand size={14} /> : <VolumeX size={14} />}
            {hint === 'tap' ? 'Tap ▶ on the video to join in — it jumps to the right spot' : 'Sound is off — tap the video, then 🔊 to unmute'}
          </span>
        </div>
      )}
    </div>
  );
}
