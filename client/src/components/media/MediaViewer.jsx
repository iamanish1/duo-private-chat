import { ImageViewer } from './ImageViewer';
import { VideoPlayer } from './VideoPlayer';

/** Opens the right full-screen viewer for an image or video message. */
export function MediaViewer({ message, onClose }) {
  if (!message) return null;
  // Prefer the on-device copy for media this device just sent.
  const src = message.localPreview?.url ?? message.media?.url;
  const thumbnail = message.localPreview?.thumbnailUrl ?? message.media?.thumbnailUrl;
  if (!src) return null;
  if (message.type === 'video') return <VideoPlayer src={src} poster={thumbnail} caption={message.text} onClose={onClose} />;
  return <ImageViewer src={src} thumbnail={thumbnail} caption={message.text} onClose={onClose} />;
}
