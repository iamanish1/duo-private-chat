import { Camera, FolderOpen, Images, Video } from 'lucide-react';
import { BottomSheet, SheetAction } from '../common/BottomSheet';

/**
 * Mobile-native pickers: library (photos+videos), camera photo, camera video,
 * and a plain file browser. `capture` hints the OS to open the camera.
 */
export function AttachmentSheet({ open, onClose, onPick }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Share">
      <SheetAction icon={Images} label="Photo & video library" description="Choose from your gallery" onClick={() => onPick('library')} />
      <SheetAction icon={Camera} label="Take a photo" description="Use your camera" onClick={() => onPick('camera-photo')} />
      <SheetAction icon={Video} label="Record a video" onClick={() => onPick('camera-video')} />
      <SheetAction icon={FolderOpen} label="Browse files" description="JPG, PNG, WEBP, GIF, MP4, MOV, WEBM" onClick={() => onPick('files')} />
    </BottomSheet>
  );
}
