import { Maximize2, MicOff, PhoneOff } from 'lucide-react';
import { useLocation } from 'react-router';
import { Avatar } from '../common/Avatar';
import { DraggablePip } from './DraggablePip';
import { VideoTile } from './VideoTile';
import { endCall, setCallMinimized } from '../../services/callController';

/**
 * The call shrunk to a floating window over the chat, so both people can keep
 * texting while they talk. Drag it to any corner; tap it to go back full screen.
 */
export function MiniCall({ call, status, video }) {
  const { peer, remoteStream, localStream, micEnabled, cameraEnabled, facingMode, phase } = call;
  const showRemote = video && phase === 'active' && remoteStream;
  const expand = () => setCallMinimized(false);
  // Watch together has its own call bar; a voice pill there would only cover the video.
  const { pathname } = useLocation();
  if (!video && pathname === '/watch') return null;


  return (
    <div className="pointer-events-none fixed inset-0 z-[45]" role="region" aria-label={`Call with ${peer?.name}`}>
      <DraggablePip onTap={expand} className={`pointer-events-auto bg-neutral-900 text-white ${video ? 'h-44 w-28 sm:h-52 sm:w-36' : 'w-36'}`}>
        {showRemote ? (
          <VideoTile stream={remoteStream} className="absolute inset-0 size-full object-cover" data-mini-remote="" />
        ) : video && localStream && cameraEnabled && phase !== 'ended' ? (
          <VideoTile stream={localStream} muted mirrored={facingMode === 'user'} className="absolute inset-0 size-full object-cover opacity-70" />
        ) : null}
        <div className={`relative flex size-full flex-col items-center ${video ? 'justify-between bg-gradient-to-b from-black/50 via-transparent to-black/70 p-2' : 'gap-2 px-3 py-3'}`}>
          {!video && <Avatar user={peer} size="md" />}
          <div className={`flex w-full items-center gap-1 ${video ? 'justify-between' : 'justify-center'}`}>
            <span className="min-w-0 truncate text-xs font-semibold tabular-nums drop-shadow">{status}</span>
            {video ? <Maximize2 size={13} className="shrink-0 opacity-80" /> : !micEnabled && <MicOff size={13} className="shrink-0" />}
          </div>
          {phase !== 'ended' && (
            <button
              type="button"
              aria-label="End call"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                endCall();
              }}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-danger text-xs font-semibold text-white active:scale-95"
            >
              <PhoneOff size={14} /> End
            </button>
          )}
        </div>
      </DraggablePip>
    </div>
  );
}
