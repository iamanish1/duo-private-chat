import { useEffect, useRef } from 'react';
import { MicOff, Phone } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { Spinner } from '../common/Spinner';
import { CallControls } from './CallControls';
import { MiniCall } from './MiniCall';
import { statusText, useAudioLevel, useAudioRoute, useElapsed, useUnreadDuringCall } from './callStatus';

/** Plays the other person's voice; there is nothing to show on screen. */
function RemoteAudio({ stream, audioRef: ref }) {
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    if (audio.srcObject !== stream) audio.srcObject = stream ?? null;
    if (stream) audio.play().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline data-remote-audio="" />;
}

/** Voice call: large avatar that glows while the other person speaks. */
export function VoiceCallScreen({ call }) {
  const { phase, peer, remoteStream, micEnabled, connectedAt, reconnecting, endReason, minimized } = call;
  const live = phase === 'active';
  const elapsed = useElapsed(live ? connectedAt : null);
  const level = useAudioLevel(live ? remoteStream : null);
  const status = statusText({ phase, reconnecting, endReason, elapsed });
  const speaking = live && level > 0.08;
  const audioRef = useRef(null);
  const route = useAudioRoute(audioRef, live);
  const unread = useUnreadDuringCall(call);

  // The audio element sits outside both layouts so minimizing never interrupts the voice.
  return (
    <>
      {remoteStream && <RemoteAudio stream={remoteStream} audioRef={audioRef} />}
      {minimized ? (
        <MiniCall call={call} status={status} />
      ) : (
        <div
          className="fixed inset-0 z-[80] flex animate-fade-in flex-col items-center justify-between bg-gradient-to-b from-[#2a1f1b] to-[#120d0b] px-6 pt-[calc(var(--safe-top)+12vh)] pb-[calc(var(--safe-bottom)+28px)] text-white"
          role="dialog"
          aria-label={`Voice call with ${peer?.name}`}
        >
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <span
                className="absolute inset-0 rounded-full bg-accent/40 transition-transform duration-150"
                style={{ transform: `scale(${1 + Math.min(level, 1) * 0.6})`, opacity: speaking ? 1 : 0 }}
                aria-hidden="true"
              />
              {!live && phase !== 'ended' && (
                <span className="absolute inset-0 animate-ring rounded-full bg-accent/40" aria-hidden="true" />
              )}
              <Avatar user={peer} size="xl" className="relative" />
            </div>
            <h2 className="mt-8 text-3xl font-semibold">{peer?.name}</h2>
            <p className="mt-2 flex items-center gap-2 text-white/75 tabular-nums" aria-live="polite">
              {(phase === 'connecting' || reconnecting) && <Spinner size={14} />}
              {status}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/45">
              <Phone size={12} /> Voice call
            </p>
            {!micEnabled && phase !== 'ended' && (
              <span className="mt-5 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                <MicOff size={13} /> You're muted
              </span>
            )}
          </div>

          {phase !== 'ended' && (
            <CallControls voice micEnabled={micEnabled} connected={phase === 'active' || phase === 'connecting'} speaker={route.available ? route : null} unread={unread} />
          )}
        </div>
      )}
    </>
  );
}
