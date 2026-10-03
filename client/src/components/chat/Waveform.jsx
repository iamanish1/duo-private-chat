/** Bar waveform; bars left of `progress` (0–1) use the played color. Tapping seeks. */
export function Waveform({ peaks, progress = 0, playedClass, restClass, onSeek, className = '' }) {
  const seek = (e) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  };
  return (
    <div
      className={`flex h-8 min-w-0 items-center gap-[2px] overflow-hidden ${onSeek ? 'cursor-pointer' : ''} ${className}`}
      onClick={seek}
      role={onSeek ? 'slider' : undefined}
      aria-label={onSeek ? 'Seek' : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      {peaks.map((peak, i) => (
        <span
          key={i}
          // Bars flex to the available width so the waveform never overflows a bubble.
          className={`max-w-[3px] min-w-[1.5px] flex-1 rounded-full transition-colors duration-150 ${(i + 0.5) / peaks.length <= progress ? playedClass : restClass}`}
          style={{ height: `${Math.max(12, peak)}%` }}
        />
      ))}
    </div>
  );
}
