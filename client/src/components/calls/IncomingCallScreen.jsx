import { Phone, PhoneOff, Video } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { acceptCall, rejectCall } from '../../services/callController';

export function IncomingCallScreen({ peer, kind = 'video' }) {
  const label = kind === 'audio' ? 'voice' : 'video';
  return (
    <div className="fixed inset-0 z-[80] flex animate-fade-in flex-col items-center justify-between bg-gradient-to-b from-[#2a1f1b] to-[#120d0b] px-6 pt-[calc(var(--safe-top)+15vh)] pb-[calc(var(--safe-bottom)+56px)] text-white" role="alertdialog" aria-label={`Incoming ${label} call from ${peer?.name}`}>
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <span className="absolute inset-0 animate-ring rounded-full bg-accent/50" aria-hidden="true" />
          <span className="absolute inset-0 animate-ring rounded-full bg-accent/40 [animation-delay:0.8s]" aria-hidden="true" />
          <Avatar user={peer} size="xl" className="relative" />
        </div>
        <h2 className="mt-8 text-3xl font-semibold">{peer?.name}</h2>
        <p className="mt-2 flex items-center justify-center gap-2 text-white/70">
          {kind === 'audio' ? <Phone size={16} /> : <Video size={16} />} Incoming {label} call
        </p>
      </div>

      <div className="flex w-full max-w-xs items-center justify-between">
        <div className="flex flex-col items-center gap-2">
          <button type="button" onClick={rejectCall} className="flex size-[72px] items-center justify-center rounded-full bg-danger shadow-float transition active:scale-90" aria-label="Decline">
            <PhoneOff size={30} />
          </button>
          <span className="text-sm text-white/80">Decline</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button type="button" onClick={acceptCall} className="flex size-[72px] items-center justify-center rounded-full bg-online shadow-float transition active:scale-90" aria-label="Accept">
            <Phone size={30} />
          </button>
          <span className="text-sm text-white/80">Accept</span>
        </div>
      </div>
    </div>
  );
}
