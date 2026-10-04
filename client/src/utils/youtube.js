// YouTube helpers for Watch together.

const ID = /^[\w-]{11}$/;

/** Video id from any common YouTube link (or a bare id); null if not YouTube. */
export function parseYouTubeId(input) {
  const value = (input || '').trim();
  if (ID.test(value)) return value;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v');
    const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
    if (!id && match) id = match[1];
  }
  return id && ID.test(id) ? id : null;
}

export const thumbnailOf = (videoId) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

let apiPromise = null;

/** Loads the YouTube IFrame Player API once; resolves window.YT. */
export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      script.remove();
      reject(new Error("Couldn't load the YouTube player. Check your connection."));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

// Player errors (https://developers.google.com/youtube/iframe_api_reference#onError).
export function describePlayerError(code) {
  if (code === 101 || code === 150 || code === 153) return "This video's owner doesn't allow it to be played inside other apps. Try another video.";
  if (code === 100) return 'This video was removed or is private.';
  if (code === 2) return "That doesn't look like a valid YouTube video.";
  return "This video can't be played right now. Try another one.";
}
