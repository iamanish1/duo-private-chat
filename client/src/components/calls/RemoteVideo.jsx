import { useEffect, useRef, useState } from 'react';
import { VideoTile } from './VideoTile';

// How different the video and screen shapes may be before we stop cropping.
const MISMATCH_RATIO = 1.3;

function useWindowAspect() {
  const [aspect, setAspect] = useState(() => window.innerWidth / window.innerHeight);
  useEffect(() => {
    const update = () => setAspect(window.innerWidth / window.innerHeight);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return aspect;
}

/**
 * The other person's video, full screen. When its shape matches the screen it
 * fills it; when it doesn't (a portrait phone shown on a landscape laptop, or
 * the reverse) the whole frame is shown uncropped over a blurred copy of itself.
 */
export function RemoteVideo({ stream }) {
  const wrapperRef = useRef(null);
  const [videoAspect, setVideoAspect] = useState(null);
  const screenAspect = useWindowAspect();

  // Track the incoming resolution; it changes when the sender rotates or switches camera.
  useEffect(() => {
    const video = wrapperRef.current?.querySelector('video[data-main]');
    if (!video) return undefined;
    const update = () => video.videoWidth && setVideoAspect(video.videoWidth / video.videoHeight);
    video.addEventListener('loadedmetadata', update);
    video.addEventListener('resize', update);
    update();
    return () => {
      video.removeEventListener('loadedmetadata', update);
      video.removeEventListener('resize', update);
    };
  }, [stream]);

  // Cropping a tall video to a wide screen cuts off heads and chins, so show it
  // whole. A wide video on a tall phone only loses its side edges — keep filling.
  const tallOnWide = videoAspect ? screenAspect / videoAspect > MISMATCH_RATIO : false;
  const [override, setOverride] = useState(null); // double-tap toggles fill ↔ fit
  const letterbox = override ?? tallOnWide;

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 overflow-hidden bg-black"
      data-fit={letterbox ? 'contain' : 'cover'}
      onDoubleClick={() => setOverride(!letterbox)}
    >
      {letterbox && (
        <VideoTile stream={stream} muted className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl" aria-hidden="true" />
      )}
      <VideoTile stream={stream} data-main="" className={`absolute inset-0 size-full ${letterbox ? 'object-contain' : 'object-cover'}`} />
    </div>
  );
}
