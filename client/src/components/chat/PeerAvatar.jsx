import { useState } from 'react';
import { CircleDashed, Image } from 'lucide-react';
import { BottomSheet, SheetAction } from '../common/BottomSheet';
import { openProfilePhoto } from '../common/ProfilePhotoViewer';
import { StatusRing } from '../status/StatusRing';
import { useStatusesOf } from '../status/useStatuses';
import { useStatusStore } from '../../store/statusStore';
import { useChatStore } from '../../store/chatStore';

/**
 * The other person's avatar. Tap to see their profile photo; when they have
 * a status (ring), choose between the status and the photo, like WhatsApp.
 */
export function PeerAvatar({ size = 'md', className = '' }) {
  const peer = useChatStore((s) => s.peer);
  const myId = useChatStore((s) => s.me?.id);
  const statuses = useStatusesOf(peer?.id);
  const openViewer = useStatusStore((s) => s.openViewer);
  const [choosing, setChoosing] = useState(false);

  const onTap = () => (statuses.length ? setChoosing(true) : openProfilePhoto(peer));

  return (
    <>
      <button type="button" onClick={onTap} disabled={!peer} className={`shrink-0 rounded-full ${className}`} aria-label={`View ${peer?.name ?? ''}'s profile photo`}>
        <StatusRing user={peer} statuses={statuses} size={size} online={peer?.isOnline} myId={myId} />
      </button>
      <BottomSheet open={choosing} onClose={() => setChoosing(false)} title={peer?.name}>
        <SheetAction
          icon={CircleDashed}
          label="View status"
          description={`${statuses.length} update${statuses.length === 1 ? '' : 's'}`}
          onClick={() => {
            setChoosing(false);
            openViewer(peer.id);
          }}
        />
        <SheetAction
          icon={Image}
          label="View profile photo"
          onClick={() => {
            setChoosing(false);
            openProfilePhoto(peer);
          }}
        />
      </BottomSheet>
    </>
  );
}
