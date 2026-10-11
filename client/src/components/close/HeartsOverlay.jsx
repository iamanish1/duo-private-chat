import { useEffect, useState } from 'react';
import { useCloseStore } from '../../services/closeActions';

const HEARTS = ['❤️', '💖', '💕', '💗', '💓', '💞'];

/** Floating hearts across the screen — when a "thinking of you" arrives or is sent. */
export function HeartsOverlay() {
  const hearts = useCloseStore((s) => s.hearts);
  const [bursts, setBursts] = useState([]);

  useEffect(() => {
    if (!hearts) return undefined;
    const id = hearts;
    const items = Array.from({ length: 14 }, (_, i) => ({
      key: `${id}-${i}`,
      emoji: HEARTS[i % HEARTS.length],
      left: 5 + Math.random() * 90,
      delay: Math.random() * 600,
      size: 26 + Math.random() * 26,
    }));
    setBursts((b) => [...b, { id, items }]);
    const timer = setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 3600);
    return () => clearTimeout(timer);
  }, [hearts]);

  if (!bursts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[75] overflow-hidden" aria-hidden="true">
      {bursts.flatMap((b) =>
        b.items.map((h) => (
          <span key={h.key} className="absolute bottom-24 animate-float-up" style={{ left: `${h.left}%`, fontSize: h.size, animationDelay: `${h.delay}ms`, animationFillMode: 'both' }}>
            {h.emoji}
          </span>
        )),
      )}
    </div>
  );
}
