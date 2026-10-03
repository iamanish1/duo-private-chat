import { useRef, useState } from 'react';

const MARGIN = 12;

/** Picture-in-picture window that can be dragged and snaps to the nearest corner. */
export function DraggablePip({ children, className = '' }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [corner, setCorner] = useState({ x: 'right', y: 'top' });
  const [delta, setDelta] = useState(null);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
    setDelta({ x: 0, y: 0 });
  };
  const onPointerMove = (e) => {
    if (drag.current) setDelta({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setCorner({ x: cx < window.innerWidth / 2 ? 'left' : 'right', y: cy < window.innerHeight / 2 ? 'top' : 'bottom' });
    drag.current = null;
    setDelta(null);
  };

  const style = {
    [corner.x]: MARGIN,
    [corner.y]: corner.y === 'top' ? `calc(var(--safe-top) + 72px)` : `calc(var(--safe-bottom) + 132px)`,
    transform: delta ? `translate(${delta.x}px, ${delta.y}px)` : undefined,
    transition: delta ? 'none' : 'all 260ms cubic-bezier(0.2, 0.9, 0.2, 1)',
  };

  return (
    <div
      ref={ref}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`absolute z-10 touch-none overflow-hidden rounded-2xl shadow-float ring-1 ring-white/20 ${className}`}
    >
      {children}
    </div>
  );
}
