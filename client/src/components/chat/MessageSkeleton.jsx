const ROWS = [
  { mine: false, w: 'w-40' },
  { mine: false, w: 'w-56' },
  { mine: true, w: 'w-32' },
  { mine: true, w: 'w-64', h: 'h-40' },
  { mine: false, w: 'w-48' },
  { mine: true, w: 'w-44' },
  { mine: false, w: 'w-28' },
];

export function MessageSkeleton() {
  return (
    <div className="flex h-full flex-col justify-end gap-2 px-3 pb-4" aria-label="Loading messages" role="status">
      {ROWS.map((row, i) => (
        <div key={i} className={`flex ${row.mine ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`${row.w} ${row.h ?? 'h-10'} animate-pulse rounded-[20px] ${row.mine ? 'rounded-br-md bg-accent/20' : 'rounded-bl-md bg-surface-2'}`}
            style={{ animationDelay: `${i * 90}ms` }}
          />
        </div>
      ))}
    </div>
  );
}
