// Captures the browser's PWA install prompt so Settings can offer it later.
let deferred = null;
const listeners = new Set();

export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event;
    listeners.forEach((fn) => fn(true));
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn(false));
  });
}

export const canPromptInstall = () => Boolean(deferred);

export function onInstallAvailability(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach((fn) => fn(false));
  return outcome === 'accepted';
}
