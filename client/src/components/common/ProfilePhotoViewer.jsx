import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { X } from 'lucide-react';
import { ImageViewer } from '../media/ImageViewer';
import { IconButton } from './IconButton';
import { initials } from '../../utils/format';

const useProfilePhoto = create((set) => ({
  user: null,
  open: (user) => set({ user }),
  close: () => set({ user: null }),
}));

/** Opens someone's profile photo full screen (from anywhere in the app). */
export const openProfilePhoto = (user) => user && useProfilePhoto.getState().open(user);

function NoPhoto({ user, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[60] flex animate-fade-in flex-col items-center justify-center bg-black/95 text-white" role="dialog" aria-modal="true" aria-label={`${user.name}'s profile photo`} onClick={onClose}>
      <IconButton label="Close" variant="glass" onClick={onClose} className="absolute top-[calc(var(--safe-top)+12px)] left-3">
        <X size={22} />
      </IconButton>
      <span className="flex size-56 items-center justify-center rounded-full bg-accent-soft text-7xl font-semibold text-accent-strong">{initials(user.name)}</span>
      <p className="mt-6 text-xl font-semibold">{user.name}</p>
      <p className="mt-1 text-sm text-white/60">No profile photo yet</p>
    </div>,
    document.body,
  );
}

/** Mounted once; shows the photo chosen with openProfilePhoto(). */
export function ProfilePhotoViewerHost() {
  const user = useProfilePhoto((s) => s.user);
  const close = useProfilePhoto((s) => s.close);
  if (!user) return null;
  if (!user.avatarUrl) return <NoPhoto user={user} onClose={close} />;
  return <ImageViewer src={user.avatarFullUrl || user.avatarUrl} thumbnail={user.avatarUrl} alt={`${user.name}'s profile photo`} caption={user.name} onClose={close} />;
}
