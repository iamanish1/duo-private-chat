import { useState } from 'react';
import { AnimatedSticker } from './AnimatedSticker';
import { resolveUrl } from '../../utils/url';

/** How a sticker message looks in the chat: big, no bubble. */
export function StickerContent({ sticker }) {
  const [failed, setFailed] = useState(false);
  if (sticker.kind === 'emoji') return <AnimatedSticker code={sticker.code} size={144} />;
  if (sticker.kind === 'custom') {
    return failed ? (
      <span className="flex size-36 items-center justify-center rounded-3xl bg-surface-2 text-sm text-muted">Sticker</span>
    ) : (
      <img src={resolveUrl(sticker.url)} alt="Sticker" className="size-40 object-contain drop-shadow-md" loading="lazy" draggable={false} onError={() => setFailed(true)} />
    );
  }
  // GIF: keep its shape, up to 240px wide.
  const width = Math.min(240, sticker.width || 200);
  const height = Math.round(width * ((sticker.height || 200) / (sticker.width || 200)));
  return failed ? (
    <span className="flex items-center justify-center rounded-2xl bg-surface-2 text-sm text-muted" style={{ width, height }}>GIF unavailable</span>
  ) : (
    <img src={sticker.url} alt={sticker.title || 'GIF'} width={width} height={height} className="rounded-2xl bg-surface-2 object-cover shadow-soft" loading="lazy" draggable={false} onError={() => setFailed(true)} />
  );
}
