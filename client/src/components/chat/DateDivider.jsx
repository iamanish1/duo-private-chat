import { formatDayLabel } from '../../utils/format';

export function DateDivider({ date }) {
  return (
    <div className="pointer-events-none sticky top-2 z-[5] flex justify-center py-2">
      <span className="glass rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted shadow-soft">
        {formatDayLabel(date)}
      </span>
    </div>
  );
}
