// Stickers: the shared tray, GIF search and sending.
import { api } from './api';
import { useStickerStore } from '../store/stickerStore';
import { toast } from '../store/toastStore';
import { sendSticker } from './chatActions';

const store = () => useStickerStore.getState();
const body = (p) => p.then((r) => r.data);

export async function loadStickers() {
  try {
    const { stickers } = await body(api.get('/stickers'));
    store().setCustom(stickers);
  } catch {
    // Next reconnect tries again.
  }
}

export async function createSticker(blob) {
  const form = new FormData();
  form.append('file', blob, 'sticker.webp');
  try {
    const { sticker } = await body(api.post('/stickers', form, { timeout: 0 }));
    store().addCustom(sticker);
    return sticker;
  } catch (err) {
    toast.error(err.message);
    return null;
  }
}

export async function deleteSticker(id) {
  try {
    await api.delete(`/stickers/${id}`);
    store().removeCustom(id);
    toast.show('Sticker removed from the tray');
  } catch (err) {
    toast.error(err.message);
  }
}

/** { gifs, nextOffset, hasMore } — or throws with code GIFS_NOT_CONFIGURED. */
export const searchGifs = (q, offset = 0) => body(api.get('/gifs', { params: { q: q || undefined, offset } }));

/** Send any sticker (emoji / your own / GIF) and remember it in Recent. */
export function send(sticker) {
  store().remember(sticker);
  sendSticker(sticker);
}

export const stickerSocketHandlers = {
  'sticker:added': (sticker) => store().addCustom(sticker),
  'sticker:removed': ({ id }) => store().removeCustom(id),
};
