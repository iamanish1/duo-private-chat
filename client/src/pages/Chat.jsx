import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { CloudOff } from 'lucide-react';
import { ChatHeader } from '../components/chat/ChatHeader';
import { ChatSidebar } from '../components/chat/ChatSidebar';
import { ChatMenuSheet } from '../components/chat/ChatMenuSheet';
import { ConnectionBanner } from '../components/chat/ConnectionBanner';
import { MessageList } from '../components/chat/MessageList';
import { MessageSkeleton } from '../components/chat/MessageSkeleton';
import { MessageActionsSheet } from '../components/chat/MessageActionsSheet';
import { Composer } from '../components/chat/Composer';
import { MediaViewer } from '../components/media/MediaViewer';
import { NotificationPrompt } from '../components/notifications/NotificationPrompt';
import { DuoCodeReminder } from '../components/settings/DuoCodeReminder';
import { StateScreen } from '../components/common/StateScreen';
import { useChatStore } from '../store/chatStore';
import { isInCall, useCallStore } from '../store/callStore';
import { toast } from '../store/toastStore';
import { ensureMessageLoaded, loadConversation } from '../services/chatActions';
import { startCall } from '../services/callController';

const PROMPT_DELAY_MS = 20_000;

export default function Chat() {
  const status = useChatStore((s) => s.status);
  const error = useChatStore((s) => s.error);
  const peer = useChatStore((s) => s.peer);
  const callPhase = useCallStore((s) => s.phase);
  const location = useLocation();
  const navigate = useNavigate();

  const [actionsFor, setActionsFor] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [jumpRequest, setJumpRequest] = useState(null);
  const [promptVisible, setPromptVisible] = useState(false);

  // Offer notifications at a natural moment: after the first send, or after a while.
  useEffect(() => {
    if (status !== 'ready') return undefined;
    const timer = setTimeout(() => setPromptVisible(true), PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const jumpTo = useCallback(async (id) => {
    if (await ensureMessageLoaded(id)) setJumpRequest({ id, at: Date.now() });
    else toast.show('That message is no longer available.');
  }, []);

  // Arriving from search with a message to show.
  const focusId = location.state?.focusMessageId;
  useEffect(() => {
    if (!focusId || status !== 'ready') return;
    jumpTo(focusId);
    navigate('.', { replace: true, state: null });
  }, [focusId, status, jumpTo, navigate]);

  const onActions = useCallback((message) => setActionsFor(message), []);
  const onOpenMedia = useCallback((message) => setViewing(message), []);
  const onCall = (kind) => peer && startCall(peer, { kind });
  const callDisabled = !peer || isInCall(callPhase);

  return (
    <div className="flex h-full">
      <ChatSidebar onCall={onCall} onOpenMedia={onOpenMedia} callDisabled={callDisabled} />

      <section className="flex min-w-0 flex-1 flex-col">
        <ChatHeader onCall={onCall} onMenu={() => setMenuOpen(true)} onProfile={() => setMenuOpen(true)} callDisabled={callDisabled} />
        <ConnectionBanner />
        {status === 'ready' && <DuoCodeReminder />}
        {status === 'ready' && <NotificationPrompt peerName={peer?.name} visible={promptVisible} />}

        {status === 'error' ? (
          <div className="flex-1">
            <StateScreen icon={CloudOff} title="Couldn't load your messages" description={error} action={{ label: 'Try again', onClick: loadConversation }} />
          </div>
        ) : status === 'ready' ? (
          <MessageList onActions={onActions} onOpenMedia={onOpenMedia} jumpRequest={jumpRequest} onJump={jumpTo} />
        ) : (
          <div className="chat-backdrop min-h-0 flex-1">
            <MessageSkeleton />
          </div>
        )}

        <Composer onFirstSend={() => setPromptVisible(true)} />
      </section>

      {actionsFor && <MessageActionsSheet message={actionsFor} onClose={() => setActionsFor(null)} />}
      {viewing && <MediaViewer message={viewing} onClose={() => setViewing(null)} />}
      <ChatMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
