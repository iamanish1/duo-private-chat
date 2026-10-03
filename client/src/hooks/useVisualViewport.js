import { useEffect } from 'react';

/**
 * Pins the app shell to the visual viewport. When the mobile keyboard opens,
 * iOS shrinks only the visual viewport (and may scroll the page); sizing the
 * fixed shell to it keeps the composer right above the keyboard without the
 * layout jumping.
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) return undefined;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty('--vv-height', `${vv.height}px`);
        root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
        // Undo the page scroll iOS applies when focusing an input.
        if (window.scrollY !== 0 && vv.offsetTop === 0) window.scrollTo(0, 0);
      });
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
}
