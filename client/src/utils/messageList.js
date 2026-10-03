// Pure helpers for the ordered message list (unit-tested in messageList.test.js).
// Order: confirmed messages by server id (ObjectIds sort chronologically as
// fixed-length hex), then still-pending local messages in creation order.

const STATUS_RANK = { failed: -1, sending: 0, sent: 1, delivered: 2, read: 3 };

export const isPending = (m) => m.status === 'sending' || m.status === 'failed';

function findIndex(list, message) {
  return list.findIndex((m) => (message.id && m.id === message.id) || (message.clientId && m.clientId === message.clientId));
}

function insertionIndex(list, message) {
  if (isPending(message)) return list.length;
  let i = list.length;
  while (i > 0 && (isPending(list[i - 1]) || list[i - 1].id > message.id)) i -= 1;
  return i;
}

/** Inserts or replaces a message, never downgrading a delivery status. */
export function upsertMessage(list, message) {
  const index = findIndex(list, message);
  if (index === -1) {
    const next = list.slice();
    next.splice(insertionIndex(list, message), 0, message);
    return next;
  }
  const current = list[index];
  const keepStatus = (STATUS_RANK[current.status] ?? 0) > (STATUS_RANK[message.status] ?? 0) && !isPending(current);
  const merged = {
    ...current,
    ...message,
    status: keepStatus ? current.status : message.status,
    // Keep the on-device preview so a just-sent photo does not flash while the remote copy loads.
    localPreview: message.localPreview ?? current.localPreview,
  };
  const next = list.slice();
  next.splice(index, 1);
  next.splice(insertionIndex(next, merged), 0, merged);
  return next;
}

export function mergeMessages(list, incoming) {
  return incoming.reduce(upsertMessage, list);
}

export function applyStatus(list, ids, status, at) {
  const set = new Set(ids);
  let changed = false;
  const next = list.map((m) => {
    if (!set.has(m.id) || (STATUS_RANK[m.status] ?? 0) >= STATUS_RANK[status]) return m;
    changed = true;
    return {
      ...m,
      status,
      deliveredAt: m.deliveredAt || at,
      readAt: status === 'read' ? at : m.readAt,
    };
  });
  return changed ? next : list;
}

export const newestConfirmedId = (list) => {
  for (let i = list.length - 1; i >= 0; i -= 1) if (!isPending(list[i])) return list[i].id;
  return null;
};

/** Newest incoming message not yet read by me. */
export function latestUnreadIncoming(list, myId) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i];
    if (m.senderId !== myId && !isPending(m)) return m.status === 'read' ? null : m;
  }
  return null;
}
