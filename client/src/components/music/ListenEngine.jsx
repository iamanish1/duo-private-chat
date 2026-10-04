import { useEffect, useRef } from 'react';
import { currentSong, expectedPosition, useMusicStore } from '../../store/musicStore';
import { useChatStore } from '../../store/chatStore';
import { control, currentPosition, reportEnded, togglePlay } from '../../services/musicActions';
import { getAudio, setAudioElement } from '../../services/audioElement';
import { resolveUrl } from '../../utils/url';
import { songSource } from '../../services/songCache';

const DRIFT_TOLERANCE_S = 1.5;
const TICK_MS = 2000;

/** Starts audio from a tap (needed when the browser refused to autoplay). */
export function resumeFromTap() {
  const audio = getAudio();
  const { room, clockOffset } = useMusicStore.getState();
  if (!audio || !room) return;
  audio.currentTime = expectedPosition(room, clockOffset);
  audio
    .play()
    .then(() => useMusicStore.getState().setNeedsTap(false))
    .catch(() => {});
}

const absolute = (url) => (url ? new URL(resolveUrl(url), window.location.origin).href : null);

/**
 * Plays the shared session on this device. Mounted once for the whole app,
 * so music keeps going while you chat, browse, or lock the screen. Uses a
 * single <audio> element (browsers let it carry on in the background) and
 * the Media Session API for lock-screen / headphone controls.
 */
export function ListenEngine() {
  const ref = useRef(null);
  const loadedSong = useRef(null); // the song we're switching to
  const readySong = useRef(null); // the song actually in the <audio> element
  const source = useRef(null); // { url, revoke } of the current song
  const joined = useMusicStore((s) => s.joined);
  const room = useMusicStore((s) => s.room);
  const song = useMusicStore(currentSong);
  const peerName = useChatStore((s) => s.peer?.name);

  useEffect(() => {
    setAudioElement(ref.current);
    return () => setAudioElement(null);
  }, []);

  const play = (audio) =>
    audio.play().then(
      () => useMusicStore.getState().setNeedsTap(false),
      (err) => err?.name === 'NotAllowedError' && useMusicStore.getState().setNeedsTap(true),
    );

  // Follow the shared state: song, position, play/pause.
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    if (!joined || !room || !song) {
      audio.pause();
      if (!joined || !room) {
        audio.removeAttribute('src');
        audio.load();
        loadedSong.current = null;
        readySong.current = null;
        source.current?.revoke();
        source.current = null;
      }
      return;
    }
    const target = expectedPosition(room, useMusicStore.getState().clockOffset);
    if (loadedSong.current !== song.id) {
      loadedSong.current = song.id;
      audio.pause();
      // From this device if saved; otherwise downloaded once and saved.
      songSource(song).then((src) => {
        if (loadedSong.current !== song.id) {
          src.revoke(); // switched again meanwhile
          return;
        }
        source.current?.revoke();
        source.current = src;
        const start = () => {
          readySong.current = song.id;
          audio.currentTime = expectedPosition(useMusicStore.getState().room, useMusicStore.getState().clockOffset);
          if (useMusicStore.getState().room?.playing) play(audio);
        };
        audio.addEventListener('loadedmetadata', start, { once: true });
        audio.src = src.url;
      });
      return;
    }
    if (readySong.current !== song.id) return; // still loading
    if (audio.readyState >= 1 && Math.abs(audio.currentTime - target) > 1) audio.currentTime = target;
    if (room.playing && audio.paused) play(audio);
    if (!room.playing && !audio.paused) audio.pause();
  }, [joined, room, song]);

  // Gentle upkeep: catch drift, and resume after an interruption (e.g. a phone call).
  useEffect(() => {
    if (!joined) return undefined;
    const timer = setInterval(() => {
      const audio = ref.current;
      const { room: r, clockOffset, needsTap } = useMusicStore.getState();
      if (!audio || !r || audio.readyState < 2 || readySong.current !== r.songId) return;
      if (r.playing && audio.paused && !needsTap) play(audio);
      if (r.playing && !audio.paused) {
        const target = expectedPosition(r, clockOffset);
        if (Math.abs(audio.currentTime - target) > DRIFT_TOLERANCE_S && target < (audio.duration || Infinity)) audio.currentTime = target;
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [joined]);

  // Lock screen / notification shade / headphone buttons.
  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return undefined;
    if (!joined || !song) {
      session.metadata = null;
      session.playbackState = 'none';
      return undefined;
    }
    try {
      session.metadata = new window.MediaMetadata({
        title: song.title,
        artist: song.artist || 'Unknown artist',
        album: peerName ? `Listening with ${peerName}` : 'Duo',
        artwork: song.coverUrl ? [{ src: absolute(song.coverUrl), sizes: '480x480' }] : [{ src: absolute('/icons/icon-512.png'), sizes: '512x512', type: 'image/png' }],
      });
    } catch {
      // MediaMetadata unsupported.
    }
    const handlers = {
      play: () => useMusicStore.getState().room?.playing || togglePlay(),
      pause: () => useMusicStore.getState().room?.playing && togglePlay(),
      nexttrack: () => control('next'),
      previoustrack: () => control('prev', { position: currentPosition() }),
      seekto: (details) => control('seek', { position: details.seekTime ?? 0 }),
    };
    Object.entries(handlers).forEach(([action, fn]) => {
      try {
        session.setActionHandler(action, fn);
      } catch {
        // Action not supported on this platform.
      }
    });
    return () => Object.keys(handlers).forEach((action) => {
      try {
        session.setActionHandler(action, null);
      } catch {
        // ignore
      }
    });
  }, [joined, song, peerName]);

  useEffect(() => {
    if (navigator.mediaSession && joined && room) navigator.mediaSession.playbackState = room.playing ? 'playing' : 'paused';
  }, [joined, room]);

  const onTimeUpdate = () => {
    const audio = ref.current;
    if (!navigator.mediaSession?.setPositionState || !audio?.duration || !Number.isFinite(audio.duration)) return;
    try {
      navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: 1 });
    } catch {
      // ignore
    }
  };

  const onEnded = () => {
    const r = useMusicStore.getState().room;
    if (r) reportEnded(r.index);
  };

  return <audio ref={ref} preload="auto" onEnded={onEnded} onTimeUpdate={onTimeUpdate} data-listen-audio="" hidden />;
}
