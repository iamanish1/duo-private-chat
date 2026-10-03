// crypto.randomUUID only exists in secure contexts; LAN testing over plain
// http (e.g. a phone hitting http://192.168.x.x) still needs ids.
export function createClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
