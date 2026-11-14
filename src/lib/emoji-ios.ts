const APPLE = "https://cdn.jsdelivr.net/gh/iamcal/emoji-data@15.1.2/img-apple-";

const bitmapCache = new Map<string, Promise<ImageBitmap>>();

export type EmojiGroup = { id: string; label: string; icon: string; glyphs: string };

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: "recent",
    label: "Often",
    icon: "🕐",
    glyphs: "😂❤️🔥✨😭😍👍🙌💀👀🎬📺💯🤣🙏👑🎉⭐",
  },
  {
    id: "faces",
    label: "Faces",
    icon: "😀",
    glyphs:
      "😀😃😄😁😆😅😂🤣🙂😉😊😇🥰😍🤩😘😗😚😙🥲😋😛😜🤪😝🤑🤗🤭🫢🫣🤫🤔🫡🤐🤨😐😑😶🫥😏😒🙄😬😮‍💨🤥😌😔😪🤤😴😷🤒🤕🤢🤮🥵🥶🥴😵🤯🤠🥳🥸😎🤓🧐😕🫤😟🙁☹️😮😯😲😳🥺🥹😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖",
  },
  {
    id: "hands",
    label: "Hands",
    icon: "👋",
    glyphs: "👋🤚🖐️✋🖖👌🤌🤏✌️🤞🫰🤟🤘🤙👈👉👆👇☝️👍👎✊👊🤛🤜👏🙌🫶👐🤲🤝🙏💪👀👁️👅👄💋💅",
  },
  {
    id: "hearts",
    label: "Hearts",
    icon: "❤️",
    glyphs: "❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟♥️😻❤️‍🔥❤️‍🩹💯💢💥💫⭐🌟✨⚡🔥",
  },
  {
    id: "nature",
    label: "Nature",
    icon: "🐶",
    glyphs: "🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🌸🌹🌺🌻🌼🌷🌱🍀🍁",
  },
  {
    id: "food",
    label: "Food",
    icon: "🍔",
    glyphs: "🍎🍊🍋🍉🍇🍓🍒🍑🍍🥭🍌🥝🍅🥑🌽🥕🍞🧀🍔🍟🍕🌭🥪🌮🍿🍩🍪🎂🍰☕🍺🍷🥤🧋",
  },
  {
    id: "fun",
    label: "Fun",
    icon: "🎬",
    glyphs: "⚽🏀🏈⚾🎾🏐🎱🏓🎬🎤🎧🎹🥁🎷🎺🎸🎮🕹️🎲🎯🏆🥇🎪🎭🎨🎤📺📻📷📸📹🎥🎞️🎭",
  },
  {
    id: "marks",
    label: "Marks",
    icon: "💯",
    glyphs: "✅❌❓❗‼️💯🔴🟠🟡🟢🔵🟣⚫⚪🟤💬🗯️💭🔔🔕💤🎵🎶➕➖✳️❇️🔴⚠️🚫🔞🆒🆕🆓🆗🆙",
  },
];

export function splitGlyphs(glyphs: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(glyphs)].map(
      (part) => part.segment,
    );
  }
  return Array.from(glyphs);
}

export function isEmojiGrapheme(glyph: string): boolean {
  return /\p{Extended_Pictographic}/u.test(glyph);
}

/** Apple image names keep the variation selector (2764-fe0f), so try that before stripping it. */
export function appleCodes(glyph: string): string[] {
  const cps: string[] = [];
  for (const ch of glyph) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp === 0xfe0e) continue;
    cps.push(cp.toString(16));
  }
  const full = cps.join("-");
  const stripped = cps.filter((cp) => cp !== "fe0f").join("-");
  if (!full) return [];
  return full === stripped ? [full] : [full, stripped];
}

export function appleEmojiUrl(glyph: string, size: 64 | 160 = 64): string {
  const code = appleCodes(glyph)[0];
  if (!code) return "";
  return `${APPLE}${size}/${code}.png`;
}

export function appleEmojiCandidates(glyph: string, size: 64 | 160 = 64): string[] {
  return appleCodes(glyph).map((code) => `${APPLE}${size}/${code}.png`);
}

export function loadAppleEmoji(glyph: string): Promise<ImageBitmap> {
  const existing = bitmapCache.get(glyph);
  if (existing) return existing;
  const pending = (async () => {
    for (const url of appleEmojiCandidates(glyph, 160)) {
      const res = await fetch(url);
      if (!res.ok) continue;
      return createImageBitmap(await res.blob());
    }
    throw new Error("Couldn't load that iOS emoji.");
  })();
  bitmapCache.set(glyph, pending);
  pending.catch(() => bitmapCache.delete(glyph));
  return pending;
}
