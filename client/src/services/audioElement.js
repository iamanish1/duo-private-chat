// The single <audio> element that plays Listen together (owned by ListenEngine).
let audioEl = null;

export const setAudioElement = (el) => {
  audioEl = el;
};

export const getAudio = () => audioEl;
