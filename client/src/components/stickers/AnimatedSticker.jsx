import { useEffect, useRef, useState } from 'react';

// Google's Noto animated emoji (CC BY 4.0), served from Google's font CDN.
const BASE = 'https://fonts.gstatic.com/s/e/notoemoji/latest';
export const stickerStillUrl = (code) => `${BASE}/${code}/emoji.svg`;
const lottieUrl = (code) => `${BASE}/${code}/lottie.json`;
export const codeToEmoji = (code) => String.fromCodePoint(...code.split('_').map((h) => parseInt(h, 16)));

let lottiePromise = null;
const loadLottie = () => (lottiePromise ??= import('lottie-web/build/player/lottie_light').then((m) => m.default ?? m));
const animationCache = new Map(); // code -> Promise<animationData>
const loadAnimation = (code) => {
  if (!animationCache.has(code)) {
    animationCache.set(
      code,
      fetch(lottieUrl(code)).then((r) => {
        if (!r.ok) throw new Error('missing');
        return r.json();
      }),
    );
    animationCache.get(code).catch(() => animationCache.delete(code));
  }
  return animationCache.get(code);
};

/**
 * A big animated emoji sticker. Plays only while on screen (scrolling past a
 * long history won't burn the battery); falls back to the still image, then
 * the plain emoji, if anything can't load.
 */
export function AnimatedSticker({ code, size = 140, className = '' }) {
  const box = useRef(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let anim;
    let observer;
    let cancelled = false;
    Promise.all([loadLottie(), loadAnimation(code)])
      .then(([lottie, data]) => {
        if (cancelled || !box.current) return;
        anim = lottie.loadAnimation({ container: box.current, renderer: 'svg', loop: true, autoplay: false, animationData: data, rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } });
        setReady(true);
        observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? anim.play() : anim.pause()), { threshold: 0.1 });
        observer.observe(box.current);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      observer?.disconnect();
      anim?.destroy();
    };
  }, [code]);

  return (
    <span className={`relative inline-block ${className}`} style={{ width: size, height: size }} role="img" aria-label={`Sticker ${codeToEmoji(code)}`}>
      {!ready && !failed && <img src={stickerStillUrl(code)} alt="" className="absolute inset-0 size-full" draggable={false} />}
      {failed && <img src={stickerStillUrl(code)} alt={codeToEmoji(code)} className="absolute inset-0 size-full" draggable={false} onError={(e) => e.currentTarget.replaceWith(Object.assign(document.createElement('span'), { textContent: codeToEmoji(code), style: `font-size:${size * 0.8}px;line-height:1` }))} />}
      <span ref={box} className="absolute inset-0" aria-hidden="true" />
    </span>
  );
}
