import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Headphones, Mic, MicOff, Phone, PhoneOff, Popcorn, Repeat, Send, Video, VideoOff } from 'lucide-react';
import { IconButton } from '../components/common/IconButton';
import { Avatar } from '../components/common/Avatar';
import { BottomSheet } from '../components/common/BottomSheet';
import { Spinner } from '../components/common/Spinner';
import { SyncedYouTubePlayer } from '../components/watch/SyncedYouTubePlayer';
import { ReactionBar, ReactionLayer } from '../components/watch/ReactionLayer';
import { WatchChat } from '../components/watch/WatchChat';
import { VideoPicker, rememberVideo } from '../components/watch/VideoPicker';
import { statusText, useElapsed } from '../components/calls/callStatus';
import { useChatStore } from '../store/chatStore';
import { useWatchStore } from '../store/watchStore';
import { isInCall, useCallStore } from '../store/callStore';
import { joinWatching, leaveWatching, ringPartner } from '../services/watchActions';
import { acceptCall, endCall, setCallMinimized, startCall, toggleCamera, toggleMic } from '../services/callController';

/** Compact controls for the call running alongside the video. */
function CallBar() {
  const { phase, kind, micEnabled, cameraEnabled, connectedAt, reconnecting, endReason } = useCallStore();
  const elapsed = useElapsed(phase === 'active' ? connectedAt : null);
  const label = phase === 'active' && !reconnecting ? `${kind === 'audio' ? 'Voice' : 'Video'} call · ${statusText({ phase, elapsed })}` : statusText({ phase, reconnecting, endReason, elapsed });
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface-2 py-1.5 pr-1.5 pl-3.5">
      <span className={`size-2 shrink-0 rounded-full ${phase === 'active' ? 'bg-online' : 'animate-pulse bg-accent'}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums" aria-live="polite">
        {label}
      </span>
      <IconButton label={micEnabled ? 'Mute' : 'Unmute'} size="sm" variant={micEnabled ? 'ghost' : 'accent'} onClick={toggleMic}>
        {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
      </IconButton>
      {kind === 'video' && (
        <IconButton label={cameraEnabled ? 'Camera off' : 'Camera on'} size="sm" variant={cameraEnabled ? 'ghost' : 'accent'} onClick={toggleCamera}>
          {cameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
        </IconButton>
      )}
      <IconButton label="End call" size="sm" variant="danger" onClick={endCall}>
        <PhoneOff size={17} />
      </IconButton>
    </div>
  );
}

export default function Watch() {
  const navigate = useNavigate();
  const peer = useChatStore((s) => s.peer);
  const connected = useChatStore((s) => s.connection === 'connected');
  const room = useWatchStore((s) => s.room);
  const joined = useWatchStore((s) => s.joined);
  const callPhase = useCallStore((s) => s.phase);
  const [checked, setChecked] = useState(false);
  const [picking, setPicking] = useState(false);
  const prevPhase = useRef(callPhase);

  const inCall = isInCall(callPhase);
  const peerHere = Boolean(peer && room?.members.includes(peer.id));
  const live = Boolean(room && joined);

  // Join whatever is on once we're connected (and again after a reconnect).
  useEffect(() => {
    if (!connected || useWatchStore.getState().joined) return undefined;
    let active = true;
    joinWatching().then((ok) => {
      if (!active) return;
      setChecked(true);
      // Joining someone who's already watching: start talking right away.
      const s = useWatchStore.getState();
      const { peer: partner } = useChatStore.getState();
      if (ok && partner && s.room?.members.includes(partner.id) && !isInCall(useCallStore.getState().phase)) startCall(partner, { kind: 'audio' });
    });
    return () => {
      active = false;
    };
  }, [connected]);

  // Leaving the screen leaves the session (a call keeps going in its mini window).
  useEffect(() => () => leaveWatching(), []);

  // Calls here stay small so the video stays visible; the partner's call is picked up automatically.
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = callPhase;
    if (!joined) return;
    const state = useWatchStore.getState();
    const partner = useChatStore.getState().peer;
    if (callPhase === 'incoming' && partner && state.room?.members.includes(partner.id)) acceptCall();
    if (isInCall(callPhase) && callPhase !== 'incoming' && (was === 'idle' || was === 'incoming' || was === 'ended')) setCallMinimized(true);
  }, [callPhase, joined]);

  useEffect(() => {
    if (room?.title) rememberVideo(room);
  }, [room?.videoId, room?.title]);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/', { replace: true }));
  const presence = !live ? 'YouTube, in sync for both of you' : peerHere ? `${peer.name} is watching with you` : `Waiting for ${peer?.name ?? 'them'} to join…`;

  return (
    <div className="flex h-full flex-col bg-canvas lg:flex-row">
      <div className="flex min-h-0 flex-col lg:flex-1">
        <header className="glass relative z-20 border-b border-line pt-safe">
          <div className="mx-auto flex h-14 items-center gap-1 px-2">
            <IconButton label="Leave watch together" onClick={goBack}>
              <ArrowLeft size={22} />
            </IconButton>
            {live && peer && <Avatar user={peer} size="sm" online={peerHere} className="ml-1" />}
            <div className="min-w-0 flex-1 px-2 leading-tight">
              <h1 className="truncate text-[16px] font-semibold">Watch together</h1>
              <p className="truncate text-xs text-muted">{presence}</p>
            </div>
            {live && !inCall && (
              <>
                <IconButton label={`Voice call ${peer?.name ?? ''}`} onClick={() => peer && startCall(peer, { kind: 'audio' })} disabled={!peer}>
                  <Phone size={20} />
                </IconButton>
                <IconButton label={`Video call ${peer?.name ?? ''}`} onClick={() => peer && startCall(peer, { kind: 'video' })} disabled={!peer}>
                  <Video size={22} />
                </IconButton>
              </>
            )}
          </div>
        </header>

        {live ? (
          <>
            <div className="relative aspect-video w-full shrink-0 bg-black lg:aspect-auto lg:min-h-0 lg:flex-1">
              <SyncedYouTubePlayer key="player" />
              <ReactionLayer />
            </div>
            <div className="shrink-0 space-y-2.5 border-b border-line px-3 py-2.5 lg:border-b-0">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-semibold">{room.title || 'YouTube video'}</p>
                  {room.author && <p className="truncate text-xs text-muted">{room.author}</p>}
                </div>
                {!peerHere && (
                  <button type="button" onClick={ringPartner} className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3 py-2 text-xs font-semibold text-accent-strong">
                    <Send size={14} /> Invite
                  </button>
                )}
                <button type="button" onClick={() => setPicking(true)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-2 text-xs font-semibold">
                  <Repeat size={14} /> Change
                </button>
              </div>
              {inCall && <CallBar />}
              <ReactionBar disabled={!peerHere} />
              {inCall && (
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
                  <Headphones size={13} /> Headphones keep the video's sound out of your mic.
                </p>
              )}
            </div>
          </>
        ) : !checked ? (
          <div className="flex flex-1 items-center justify-center text-muted">
            <Spinner />
          </div>
        ) : (
          <div className="scroll-area flex-1 px-4 pt-10 pb-safe">
            <div className="mx-auto max-w-lg text-center">
              <span className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-accent-soft text-accent-strong">
                <Popcorn size={32} />
              </span>
              <h2 className="mt-4 text-2xl font-semibold">Watch together</h2>
              <p className="mt-2 text-sm text-muted">
                Paste a YouTube link — a cartoon, a show, a trailer or a music video. {peer?.name ?? 'They'} get an invite, and play, pause and skipping stay in sync for both of you. Talk while you watch.
              </p>
            </div>
            <div className="mt-6">
              <VideoPicker />
            </div>
            <p className="mx-auto mt-8 max-w-lg text-center text-xs text-muted">Netflix, Prime Video, Hotstar and other paid apps can't be shared — they block playback inside other apps.</p>
          </div>
        )}
      </div>

      {live && (
        <aside className="flex min-h-0 flex-1 flex-col bg-surface lg:w-96 lg:flex-none lg:border-l lg:border-line">
          <WatchChat />
        </aside>
      )}

      <BottomSheet open={picking} onClose={() => setPicking(false)} title="Change video">
        <div className="px-5 pb-4">
          <p className="mb-3 text-sm text-muted">It switches for both of you and starts from the beginning.</p>
          <VideoPicker compact onDone={() => setPicking(false)} />
        </div>
      </BottomSheet>
    </div>
  );
}
