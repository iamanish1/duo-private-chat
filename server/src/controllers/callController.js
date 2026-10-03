import { listCalls } from '../services/callService.js';
import { getIceServers } from '../services/iceService.js';

// Call setup/teardown is realtime and runs over Socket.IO (sockets/callHandlers.js);
// REST serves history and ICE configuration.
export async function history(req, res) {
  res.json(await listCalls(req.session.conversation._id, req.valid.query));
}

export function iceServers(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(getIceServers(String(req.session.user._id)));
}
