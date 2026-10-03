import { Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff, Volume2 } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { endCall, switchCamera, toggleCamera, toggleMic } from '../../services/callController';

function Control({ label, active = false, onClick, children, disabled }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <IconButton label={label} size="lg" variant={active ? 'glass-active' : 'glass'} onClick={onClick} disabled={disabled}>
        {children}
      </IconButton>
      <span className="text-[11px] font-medium text-white/75">{label}</span>
    </div>
  );
}

export function CallControls({ micEnabled, cameraEnabled, canSwitchCamera, connected, voice = false, speaker = null }) {
  return (
    <div className="flex items-start justify-center gap-5 sm:gap-7">
      <Control label={micEnabled ? 'Mute' : 'Unmute'} active={!micEnabled} onClick={toggleMic}>
        {micEnabled ? <Mic size={24} /> : <MicOff size={24} />}
      </Control>
      {speaker && (
        <Control label={speaker.speakerOn ? 'Speaker on' : 'Speaker'} active={speaker.speakerOn} onClick={speaker.toggle}>
          <Volume2 size={24} />
        </Control>
      )}
      {!voice && (
        <Control label={cameraEnabled ? 'Camera off' : 'Camera on'} active={!cameraEnabled} onClick={toggleCamera}>
          {cameraEnabled ? <Video size={24} /> : <VideoOff size={24} />}
        </Control>
      )}
      {!voice && canSwitchCamera && (
        <Control label="Flip" onClick={switchCamera} disabled={!connected || !cameraEnabled}>
          <SwitchCamera size={24} />
        </Control>
      )}
      <div className="flex flex-col items-center gap-1.5">
        <IconButton label="End call" size="lg" variant="danger" onClick={endCall}>
          <PhoneOff size={26} />
        </IconButton>
        <span className="text-[11px] font-medium text-white/75">End</span>
      </div>
    </div>
  );
}
