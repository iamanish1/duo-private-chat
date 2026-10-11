import { SharedList } from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { toObjectId } from '../utils/ids.js';
import { emitToConversation } from '../sockets/realtime.js';

const MAX_LISTS = 30;
const MAX_ITEMS = 500;

export function serializeList(list) {
  return {
    id: String(list._id),
    name: list.name,
    emoji: list.emoji || '📝',
    items: (list.items ?? []).map((i) => ({
      id: String(i._id),
      text: i.text,
      done: Boolean(i.done),
      addedBy: String(i.addedBy),
      doneBy: i.doneBy ? String(i.doneBy) : null,
      doneAt: i.doneAt ?? null,
      createdAt: i.createdAt,
    })),
    createdBy: String(list.createdBy),
    updatedAt: list.updatedAt,
  };
}

const scope = (session) => ({ conversationId: session.conversation._id });

// Every change sends the whole (small) list to both phones.
async function publish(session, listId) {
  const list = await SharedList.findById(listId).lean();
  if (!list) throw notFound('That list was deleted.', 'LIST_NOT_FOUND');
  const dto = serializeList(list);
  emitToConversation(session.conversation._id, 'list:updated', dto);
  return dto;
}

export async function listLists(session) {
  return (await SharedList.find(scope(session)).sort({ createdAt: 1 }).lean()).map(serializeList);
}

export async function createList(session, { name, emoji }) {
  if ((await SharedList.countDocuments(scope(session))) >= MAX_LISTS) throw badRequest(`You can have up to ${MAX_LISTS} lists.`, 'TOO_MANY_LISTS');
  const list = await SharedList.create({ ...scope(session), createdBy: session.user._id, name, emoji: emoji || '📝' });
  return publish(session, list._id);
}

async function own(session, listId) {
  const list = await SharedList.findOne({ ...scope(session), _id: toObjectId(listId) }).select('_id items._id').lean();
  if (!list) throw notFound('That list was deleted.', 'LIST_NOT_FOUND');
  return list;
}

export async function updateList(session, listId, changes) {
  await own(session, listId);
  await SharedList.updateOne({ _id: toObjectId(listId) }, { $set: changes });
  return publish(session, listId);
}

export async function deleteList(session, listId) {
  await own(session, listId);
  await SharedList.deleteOne({ _id: toObjectId(listId) });
  emitToConversation(session.conversation._id, 'list:removed', { id: String(listId) });
}

export async function addItem(session, listId, text) {
  const list = await own(session, listId);
  if (list.items.length >= MAX_ITEMS) throw badRequest(`A list can hold up to ${MAX_ITEMS} items.`, 'LIST_FULL');
  await SharedList.updateOne({ _id: list._id }, { $push: { items: { text, addedBy: session.user._id } } });
  return publish(session, listId);
}

export async function updateItem(session, listId, itemId, { text, done }) {
  await own(session, listId);
  const set = {};
  if (text !== undefined) set['items.$.text'] = text;
  if (done !== undefined) {
    set['items.$.done'] = done;
    set['items.$.doneBy'] = done ? session.user._id : null;
    set['items.$.doneAt'] = done ? new Date() : null;
  }
  const res = await SharedList.updateOne({ _id: toObjectId(listId), 'items._id': toObjectId(itemId) }, { $set: set });
  if (!res.matchedCount) throw notFound('That item was removed.', 'ITEM_NOT_FOUND');
  return publish(session, listId);
}

export async function removeItem(session, listId, itemId) {
  await own(session, listId);
  await SharedList.updateOne({ _id: toObjectId(listId) }, { $pull: { items: { _id: toObjectId(itemId) } } });
  return publish(session, listId);
}
