import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { resolveUrl } from '../../utils/url';

// Shared chat backgrounds. Each preset has a light and a dark version so the
// chat stays comfortable in both themes; ids are what the server stores.
export const WALLPAPER_COLORS = [
  { id: 'sand', name: 'Sand', light: '#efe3d3', dark: '#2a221d' },
  { id: 'blush', name: 'Blush', light: '#f6dde0', dark: '#2e1f24' },
  { id: 'peach', name: 'Peach', light: '#fbe2cf', dark: '#30231a' },
  { id: 'sage', name: 'Sage', light: '#dfe8da', dark: '#1f2a22' },
  { id: 'mint', name: 'Mint', light: '#d6efe6', dark: '#16291f' },
  { id: 'sky', name: 'Sky', light: '#dbe8f3', dark: '#1b2632' },
  { id: 'lavender', name: 'Lavender', light: '#e6e0f3', dark: '#241f33' },
  { id: 'slate', name: 'Slate', light: '#e2e5ea', dark: '#1c1f24' },
];

export const WALLPAPER_GRADIENTS = [
  { id: 'sunset', name: 'Sunset', light: 'linear-gradient(160deg, #ffd8b5, #f8b3b0 50%, #d2b1e3)', dark: 'linear-gradient(160deg, #4a2d27, #3c2030 50%, #271b38)' },
  { id: 'ocean', name: 'Ocean', light: 'linear-gradient(160deg, #c4e6f6, #aecbf3 50%, #c9bdf4)', dark: 'linear-gradient(160deg, #0f2b3e, #142441 50%, #241d3f)' },
  { id: 'forest', name: 'Forest', light: 'linear-gradient(160deg, #dcefd4, #bfe0c9 50%, #aed3cd)', dark: 'linear-gradient(160deg, #15281d, #132520 50%, #102124)' },
  { id: 'rose', name: 'Rose', light: 'linear-gradient(160deg, #fde4e6, #f9d3e2 50%, #e4eeea)', dark: 'linear-gradient(160deg, #3b2028, #2f1c2b 50%, #1e2725)' },
  { id: 'aurora', name: 'Aurora', light: 'linear-gradient(160deg, #c8f1e3, #bddaf8 50%, #e5cbf6)', dark: 'linear-gradient(160deg, #11332a, #142b41 50%, #2c1b3d)' },
  { id: 'dusk', name: 'Dusk', light: 'linear-gradient(180deg, #f5d7c4, #cfc2e6)', dark: 'linear-gradient(180deg, #3a2a2a, #1d1a33)' },
];

const PRESETS = { color: WALLPAPER_COLORS, gradient: WALLPAPER_GRADIENTS };

/** CSS background for a non-photo wallpaper, or null for the app's default. */
export function presetBackground(wallpaper, theme) {
  const preset = PRESETS[wallpaper?.kind]?.find((p) => p.id === wallpaper.value);
  return preset ? preset[theme === 'dark' ? 'dark' : 'light'] : null;
}

// How different the photo and screen shapes may be before we stop cropping.
const MISMATCH_RATIO = 1.3;

/**
 * A photo background. When its shape roughly matches the chat area (a
 * portrait photo on a phone) it fills it. When it doesn't (a portrait photo
 * on a wide laptop screen), "fill" would zoom in 2–3× and cut most of it off,
 * so the whole photo is shown instead, over a soft blurred copy of itself.
 */
function PhotoWallpaper({ url, dim, className }) {
  const ref = useRef(null);
  const [photoAspect, setPhotoAspect] = useState(null);
  const [boxAspect, setBoxAspect] = useState(null);

  useEffect(() => {
    let active = true;
    const img = new Image();
    img.onload = () => active && img.naturalHeight && setPhotoAspect(img.naturalWidth / img.naturalHeight);
    img.src = url;
    return () => {
      active = false;
    };
  }, [url]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => el.clientHeight && setBoxAspect(el.clientWidth / el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const mismatch = photoAspect && boxAspect ? Math.max(photoAspect / boxAspect, boxAspect / photoAspect) : 1;
  const fit = mismatch > MISMATCH_RATIO;
  const image = { backgroundImage: `url("${url}")` };

  return (
    <div ref={ref} className={`${className} overflow-hidden bg-canvas`} aria-hidden="true" data-fit={fit ? 'contain' : 'cover'}>
      {fit ? (
        <>
          <div className="absolute -inset-10 scale-110 bg-cover bg-center opacity-80 blur-2xl" style={image} />
          <div className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={image} />
        </>
      ) : (
        <div className="absolute inset-0 bg-cover bg-center" style={image} />
      )}
      <div className="absolute inset-0 bg-black" style={{ opacity: dim / 100 }} />
    </div>
  );
}

/**
 * The shared chat background, drawn as a fixed layer behind the messages
 * (so a photo doesn't scroll away). `imageUrl` may be a local preview.
 */
export function ChatWallpaper({ wallpaper, className = 'absolute inset-0' }) {
  const { resolved } = useTheme();
  if (!wallpaper || wallpaper.kind === 'default') return <div className={`chat-backdrop ${className}`} aria-hidden="true" />;
  if (wallpaper.kind === 'photo' && wallpaper.imageUrl) return <PhotoWallpaper url={resolveUrl(wallpaper.imageUrl)} dim={wallpaper.dim ?? 0} className={className} />;
  const background = presetBackground(wallpaper, resolved);
  if (!background) return <div className={`chat-backdrop ${className}`} aria-hidden="true" />;
  return <div className={className} style={{ background }} aria-hidden="true" />;
}
