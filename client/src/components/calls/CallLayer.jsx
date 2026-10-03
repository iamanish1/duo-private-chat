import { useCallStore } from '../../store/callStore';
import { useWebRTC } from '../../hooks/useWebRTC';
import { IncomingCallScreen } from './IncomingCallScreen';
import { CallScreen } from './CallScreen';

/** Global overlay that renders whatever call state we're in. */
export function CallLayer() {
  useWebRTC();
  const call = useCallStore();
  if (call.phase === 'idle') return null;
  if (call.phase === 'incoming') return <IncomingCallScreen peer={call.peer} />;
  return <CallScreen call={call} />;
}
