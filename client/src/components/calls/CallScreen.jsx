import { useEffect, useState } from 'react';
import { MicOff, VideoOff } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { Spinner } from '../common/Spinner';
import { VideoTile } from './VideoTile';
import { RemoteVideo } from './RemoteVideo';
import { DraggablePip } from './DraggablePip';
import { CallControls } from './CallControls';
import { formatDuration } from '../../utils/format';

function useElapsed(since) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since ? Math.floor((now - since) / 1000) : 0;
}

function statusText({ phase, reconnecting, endReason, elapsed }) {
  if (phase === 'ended') return endReason || 'Call ended';
  if (reconnecting) return 'Reconnecting…';
  if (phase === 'outgoing') return 'Calling…';
  if (phase === 'connecting') return 'Connecting…';
  return formatDuration(elapsed);
}

/** Portrait-first call UI: remote video full-screen, local video as a draggable PiP. */
export function CallScreen({ call }) {
  const { phase, peer, localStream, remoteStream, micEnabled, cameraEnabled, canSwitchCamera, facingMode, connectedAt, reconnecting, endReason } = call;
  const elapsed = useElapsed(phase === 'active' ? connectedAt : null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const live = phase === 'active';
  const showRemote = live && remoteStream;

  // Auto-hide controls during a call; tap anywhere to bring them back.
  useEffect(() => {
    if (!live || !chromeVisible) return undefined;
    const timer = setTimeout(() => setChromeVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [live, chromeVisible]);

  const status = statusText({ phase, reconnecting, endReason, elapsed });

  return (
    <div className="fixed inset-0 z-[80] animate-fade-in overflow-hidden bg-[#0d0a09] text-white" onClick={() => setChromeVisible(true)} role="dialog" aria-label={`Video call with ${peer?.name}`}>
      {showRemote ? (
        <RemoteVideo stream={remoteStream} />
      ) : phase !== 'ended' && localStream ? (
        // While ringing, show yourself full screen like a mirror.
        <VideoTile stream={localStream} muted mirrored={facingMode === 'user'} className="absolute inset-0 size-full object-cover opacity-60 blur-[1px]" />
      ) : null}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/65" />

      {/* Peer identity + status */}
      <div className={`absolute inset-x-0 top-0 flex flex-col items-center px-6 pt-[calc(var(--safe-top)+20px)] text-center transition-opacity duration-300 ${showRemote && !chromeVisible ? 'opacity-0' : 'opacity-100'}`}>
        {!showRemote && <Avatar user={peer} size="xl" className="mt-[8vh] mb-5" />}
        <h2 className={`${showRemote ? 'text-lg' : 'text-3xl'} font-semibold drop-shadow`}>{peer?.name}</h2>
        <p className="mt-1 flex items-center gap-2 text-sm text-white/80 tabular-nums" aria-live="polite">
          {(phase === 'connecting' || reconnecting) && <Spinner size={14} />}
          {status}
        </p>
      </div>

      {showRemote && localStream && (
        <DraggablePip className="h-44 w-28 bg-neutral-900 sm:h-56 sm:w-36">
          {cameraEnabled ? (
            <VideoTile stream={localStream} muted mirrored={facingMode === 'user'} className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-white/70">
              <VideoOff size={22} />
            </span>
          )}
          {!micEnabled && (
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 p-1">
              <MicOff size={12} />
            </span>
          )}
        </DraggablePip>
      )}

      {phase !== 'ended' && (
        <div
          className={`absolute inset-x-0 bottom-0 px-6 pt-10 pb-[calc(var(--safe-bottom)+28px)] transition duration-300 ${chromeVisible || !live ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <CallControls micEnabled={micEnabled} cameraEnabled={cameraEnabled} canSwitchCamera={canSwitchCamera} connected={phase === 'active' || phase === 'connecting'} />
        </div>
      )}
    </div>
  );
}
