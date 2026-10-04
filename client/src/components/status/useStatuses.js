import { useMemo } from 'react';
import { isLive, useStatusStore } from '../../store/statusStore';
import { useNow } from '../../hooks/useNow';

/** One person's statuses that haven't expired, oldest first. */
export function useStatusesOf(userId) {
  const all = useStatusStore((s) => s.statuses);
  const now = useNow(60_000);
  return useMemo(() => (userId ? all.filter((s) => s.userId === userId && isLive(s, now.getTime())) : []), [all, userId, now]);
}
