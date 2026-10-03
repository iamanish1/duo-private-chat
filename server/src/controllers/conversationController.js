import { User } from '../models/index.js';
import { publicUser, selfUser } from '../services/serializers.js';
import { isUserOnline } from '../sockets/realtime.js';

export async function getConversation(req, res) {
  const { user, conversation, peerId } = req.session;
  const peer = await User.findById(peerId).lean();
  // Presence comes from live sockets, not the DB flag, so it is never stale.
  const online = await isUserOnline(peerId);
  res.json({
    conversation: { id: String(conversation._id), createdAt: conversation.createdAt },
    me: selfUser(user),
    peer: publicUser(peer, { isOnline: online }),
  });
}
