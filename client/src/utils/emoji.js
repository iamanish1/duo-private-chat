// Curated, lightweight emoji set (no heavy picker dependency on mobile).
const group = (id, label, list) => ({ id, label, emojis: list.split(' ') });

export const EMOJI_GROUPS = [
  group('smileys', 'Smileys', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 ☺️ 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫥 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 🤡 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾'),
  group('love', 'Love', '❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 🩷 🩵 🩶 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💌 💋 😘 🥰 😍 💑 💏 👩‍❤️‍👨 👨‍❤️‍👨 👩‍❤️‍👩 🌹 🥀 💐 🫶 🤟'),
  group('gestures', 'Gestures', '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 👀 👁️ 👅 👄 🫦 🧠 🫀 🙋 🙆 🙅 🤷 🤦 🙇 💁 🙎 🙍 🧏'),
  group('nature', 'Nature', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦉 🦋 🐌 🐞 🐢 🐬 🐳 🦈 🐙 🦄 🐝 🌸 🌼 🌻 🌺 🌷 🌹 🍀 🌿 🌱 🌳 🌴 🌵 🍁 🍂 🌙 ⭐ 🌟 ✨ ⚡ 🔥 🌈 ☀️ 🌤️ ⛅ 🌧️ ⛈️ ❄️ ☃️ 🌊 💧'),
  group('food', 'Food', '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🌽 🥕 🥐 🍞 🧀 🥚 🍳 🥞 🧇 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍣 🍱 🥟 🍤 🍙 🍚 🍦 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍿 ☕ 🍵 🧋 🥤 🍺 🍻 🥂 🍷 🍸 🍹 🍾'),
  group('activity', 'Activity', '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🏸 🥊 🏋️ 🧘 🚴 🏊 🏄 ⛷️ 🎿 🏆 🥇 🎮 🎲 🧩 🎯 🎳 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎸 🎻 🎭 🎉 🎊 🎈 🎁 🎀 🪅 🕯️ 🎄 🎃'),
  group('travel', 'Travel', '🚗 🚕 🚙 🚌 🏎️ 🚓 🚑 🚲 🛵 🏍️ ✈️ 🛫 🛬 🚀 🛸 🚁 ⛵ 🚤 🚢 🚂 🚆 🚇 🗺️ 🧭 🏔️ ⛰️ 🏕️ 🏖️ 🏝️ 🏜️ 🏠 🏡 🏙️ 🌆 🌇 🌃 🌉 🎡 🎢 🗼 🗽 ⛲ 🌍 🌎 🌏'),
  group('objects', 'Objects', '📱 💻 ⌚ 📷 📸 🎥 📞 ⏰ ⌛ 💡 🔦 🕯️ 💸 💵 💳 💎 🔑 🗝️ 🔒 🔓 🛏️ 🛋️ 🚿 🛁 🧸 🪞 🖼️ 🛍️ 🎁 ✉️ 📦 📝 📌 📎 ✂️ 📚 📖 🔖 🧷 💊 🩹 🧴 🪥 ☂️ 👓 🕶️ 👗 👕 👖 👟 👠 👑 💍'),
  group('symbols', 'Symbols', '💯 ✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ✖️ ➗ ❓ ❔ ❕ ❗ ‼️ ⁉️ 💤 💢 💥 💫 💦 💨 🕳️ 💬 🗨️ 💭 🔔 🔕 🎵 🎶 ⚠️ 🚫 ⛔ ♻️ 🔆 🔅 ⭕ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 💠 🔷 🔶 ♾️ 🆗 🆒 🆕 🆓 🔝 🔜'),
];

const RECENT_KEY = 'duo-recent-emoji';
const MAX_RECENT = 24;

export function getRecentEmoji() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(emoji) {
  try {
    const next = [emoji, ...getRecentEmoji().filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private mode); recents are a nicety.
  }
}

/** True for messages made only of 1–3 emoji, rendered large. */
export function isEmojiOnly(text) {
  if (!text || text.length > 24) return false;
  const stripped = text.replace(/\s/g, '');
  if (!/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️)+$/u.test(stripped)) return false;
  // Digits, # and * are emoji components too; require a real pictograph.
  if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(stripped)) return false;
  const count = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(stripped)].length;
  return count <= 3;
}
