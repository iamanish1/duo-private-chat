import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import { getAudio } from '../../services/audioElement';
import { useMusicStore } from '../../store/musicStore';
import { resolveUrl } from '../../utils/url';

/** Album art, or a warm gradient with a note when the file had none. */
export function Cover({ song, className = 'size-12 rounded-xl', iconSize = 20 }) {
  const [failed, setFailed] = useState(null);
  const src = song?.coverUrl && song.coverUrl !== failed ? resolveUrl(song.coverUrl) : null;
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-accent to-accent-strong text-on-accent ${className}`}>
      {src ? <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(song.coverUrl)} draggable={false} /> : <Music size={iconSize} />}
    </span>
  );
}

/** Live playback position of this device's player (4×/s while listening). */
export function useAudioProgress() {
  const joined = useMusicStore((s) => s.joined);
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  useEffect(() => {
    if (!joined) return undefined;
    const read = () => {
      const audio = getAudio();
      if (audio) setProgress({ current: audio.currentTime || 0, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    };
    read();
    const timer = setInterval(read, 250);
    return () => clearInterval(timer);
  }, [joined]);
  return progress;
}
