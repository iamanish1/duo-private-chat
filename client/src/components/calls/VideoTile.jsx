import { useEffect, useRef } from 'react';

/** Binds a MediaStream to a <video>; iOS needs playsInline + muted for autoplay. */
export function VideoTile({ stream, muted = false, mirrored = false, className = '', ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream ?? null;
    if (stream) video.play().catch(() => {});
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`${className} ${mirrored ? '-scale-x-100' : ''}`}
      {...rest}
    />
  );
}
