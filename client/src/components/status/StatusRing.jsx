import { Avatar } from '../common/Avatar';

const AVATAR_PX = { sm: 36, md: 44, lg: 64, xl: 112 };

/**
 * Avatar inside a WhatsApp-style ring: one arc per status, coloured while
 * unseen and grey once seen. Without statuses it is just the avatar.
 */
export function StatusRing({ user, statuses, size = 'md', online = false, myId }) {
  if (!statuses?.length) return <Avatar user={user} size={size} online={online} />;
  const px = AVATAR_PX[size];
  const stroke = size === 'xl' ? 3.5 : 2.5;
  const gap = size === 'xl' ? 4 : 2.5;
  const box = px + 2 * (gap + stroke);
  const r = (box - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const slot = circumference / statuses.length;
  const space = statuses.length > 1 ? Math.min(6, slot * 0.18) : 0;

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: box, height: box }}>
      <svg width={box} height={box} className="absolute inset-0 -rotate-90" aria-hidden="true">
        {statuses.map((s, i) => {
          // Your own statuses always show coloured; theirs go grey once you've seen them.
          const fresh = s.userId === myId || !s.viewedAt;
          return (
            <circle
              key={s.id}
              cx={box / 2}
              cy={box / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap={statuses.length > 1 ? 'round' : 'butt'}
              className={fresh ? 'stroke-accent' : 'stroke-muted/45'}
              strokeDasharray={`${slot - space} ${circumference - slot + space}`}
              strokeDashoffset={-(i * slot + space / 2)}
            />
          );
        })}
      </svg>
      <Avatar user={user} size={size} online={online} />
    </span>
  );
}
