import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { History, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from 'lucide-react';
import { PageLayout } from '../components/common/PageLayout';
import { IconButton } from '../components/common/IconButton';
import { StateScreen } from '../components/common/StateScreen';
import { Spinner } from '../components/common/Spinner';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { callApi } from '../services/api';
import { startCall } from '../services/callController';
import { useChatStore } from '../store/chatStore';
import { isInCall, useCallStore } from '../store/callStore';
import { formatDayLabel, formatDuration, formatTime } from '../utils/format';

function describe(call, myId) {
  const outgoing = call.callerId === myId;
  const kind = call.type === 'audio' ? 'voice' : 'video';
  if (call.status === 'missed') return { icon: PhoneMissed, label: outgoing ? `No answer · ${kind}` : `Missed ${kind} call`, tone: outgoing ? 'text-muted' : 'text-danger' };
  if (call.status === 'rejected') return { icon: outgoing ? PhoneOutgoing : PhoneIncoming, label: `Declined · ${kind}`, tone: 'text-muted' };
  return { icon: outgoing ? PhoneOutgoing : PhoneIncoming, label: `${outgoing ? 'Outgoing' : 'Incoming'} ${kind} call`, tone: 'text-online' };
}

export default function Calls() {
  const navigate = useNavigate();
  const me = useChatStore((s) => s.me);
  const peer = useChatStore((s) => s.peer);
  const callPhase = useCallStore((s) => s.phase);
  const fetchPage = useCallback((before) => callApi.history({ before }).then(({ calls, hasMore }) => ({ items: calls, hasMore })), []);
  const { items, hasMore, loading, error, sentinelRef, reload } = usePaginatedList(fetchPage, 'calls');

  const busy = !peer || isInCall(callPhase);
  const callBack = (kind) => {
    if (!peer) return;
    startCall(peer, { kind });
    navigate('/');
  };

  return (
    <PageLayout
      title="Call history"
      actions={
        <>
          <IconButton label={`Voice call ${peer?.name ?? ''}`} onClick={() => callBack('audio')} disabled={busy}>
            <Phone size={21} />
          </IconButton>
          <IconButton label={`Video call ${peer?.name ?? ''}`} onClick={() => callBack('video')} disabled={busy}>
            <Video size={22} />
          </IconButton>
        </>
      }
    >
      {error && !items.length ? (
        <StateScreen title="Couldn't load calls" description={error} action={{ label: 'Try again', onClick: reload }} className="py-24" />
      ) : !loading && !items.length ? (
        <StateScreen icon={History} title="No calls yet" description={`Tap the phone or camera icon to call ${peer?.name ?? ''}.`} className="py-24" />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((call) => {
            const { icon: Icon, label, tone } = describe(call, me?.id);
            return (
              <li key={call.id} className="flex items-center gap-4 px-4 py-3.5">
                <span className={`flex size-11 items-center justify-center rounded-2xl bg-surface-2 ${tone}`}>
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${call.status === 'missed' && call.callerId !== me?.id ? 'text-danger' : ''}`}>{label}</span>
                  <span className="block text-sm text-muted">
                    {formatDayLabel(call.createdAt)}, {formatTime(call.createdAt)}
                    {call.duration > 0 && ` · ${formatDuration(call.duration)}`}
                  </span>
                </span>
                <IconButton
                  label={call.type === 'audio' ? 'Voice call back' : 'Video call back'}
                  variant="muted"
                  onClick={() => callBack(call.type === 'audio' ? 'audio' : 'video')}
                  disabled={busy}
                >
                  {call.type === 'audio' ? <Phone size={19} /> : <Video size={20} />}
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      {loading && (
        <div className="flex justify-center py-8 text-muted">
          <Spinner />
        </div>
      )}
      {hasMore && <div ref={sentinelRef} className="h-px" />}
    </PageLayout>
  );
}
