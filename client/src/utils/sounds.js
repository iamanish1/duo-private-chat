// Tiny synthesized tones (no audio files). Browsers may block audio until the
// user has interacted with the page; failures are silent by design.
let ctx = null;
let loop = null;

function context() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  ctx ??= new AudioCtx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(frequencies, duration, gainValue = 0.05) {
  const audio = context();
  if (!audio) return;
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(gainValue, now + 0.03);
  gain.gain.setValueAtTime(gainValue, now + duration - 0.06);
  gain.gain.linearRampToValueAtTime(0, now + duration);
  gain.connect(audio.destination);
  frequencies.forEach((frequency) => {
    const osc = audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + duration);
  });
}

function startLoop(play, interval) {
  stopTones();
  try {
    play();
    loop = setInterval(play, interval);
  } catch {
    loop = null;
  }
}

/** Incoming call: a warm two-note chime, plus vibration where supported. */
export function startRingtone() {
  startLoop(() => {
    tone([659.25], 0.18, 0.06);
    setTimeout(() => tone([880], 0.28, 0.06), 200);
    navigator.vibrate?.([350, 200, 350]);
  }, 2400);
}

/** Outgoing call: a soft ringback. */
export function startRingback() {
  startLoop(() => tone([440, 480], 1.2, 0.025), 3600);
}

export function stopTones() {
  clearInterval(loop);
  loop = null;
  navigator.vibrate?.(0);
}

export function playEndTone() {
  try {
    tone([480], 0.15, 0.04);
    setTimeout(() => tone([360], 0.25, 0.04), 170);
  } catch {
    // ignore
  }
}

/** Browsers only allow audio after a user gesture; prime it on the first tap. */
export function unlockAudioOnFirstInteraction() {
  const unlock = () => {
    try {
      context();
    } catch {
      // ignore
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** Soft two-note chime for a new message (in-tab fallback, works in incognito). */
export function playMessageChime() {
  try {
    tone([880], 0.12, 0.035);
    setTimeout(() => tone([1318.5], 0.2, 0.035), 120);
  } catch {
    // ignore
  }
}
