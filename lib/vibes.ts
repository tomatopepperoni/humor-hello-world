/**
 * Caption "vibes" the user picks from, and the daily theme rotation.
 * Shared by server and client code, so no Node-only imports here.
 *
 * Each vibe is drawn as a subway-style line bullet (letter in a coloured circle).
 */

export const VIBES = {
  "chronically-online": {
    label: "Chronically online",
    emoji: "📱",
    bullet: { letter: "O", bg: "#b933ad", fg: "#ffffff" },
    blurb: "Lowercase, deadpan, internet-brained.",
    instruction:
      "Write like someone who lives on TikTok and X: lowercase, deadpan, uses current internet slang naturally (not cringe), no hashtags.",
  },
  roast: {
    label: "Roast me",
    emoji: "🔥",
    bullet: { letter: "R", bg: "#ee352e", fg: "#ffffff" },
    blurb: "Roasts the situation, never the person.",
    instruction:
      "Lovingly roast the person posting this. Sharp, specific, never cruel about appearance or identity – roast the situation, the choices, the NYC-newbie energy.",
  },
  "midwest-nice": {
    label: "Midwest nice",
    emoji: "🌽",
    bullet: { letter: "M", bg: "#fccc0a", fg: "#16181a" },
    blurb: "Polite, overwhelmed, a little “ope”.",
    instruction:
      "Write as a very polite Midwesterner who is overwhelmed by New York City but trying to be positive about it. Wholesome, a little naive, 'ope'-energy.",
  },
  "main-character": {
    label: "Main character",
    emoji: "🎬",
    bullet: { letter: "C", bg: "#0039a6", fg: "#ffffff" },
    blurb: "The opening scene of your NYC movie.",
    instruction:
      "Write as if this moment is the opening scene of a coming-of-age movie set in New York. Dramatic, cinematic, slightly self-aware.",
  },
} as const;

export type Vibe = keyof typeof VIBES;

export const VIBE_KEYS = Object.keys(VIBES) as Vibe[];

export function isVibe(v: unknown): v is Vibe {
  return typeof v === "string" && v in VIBES;
}

/**
 * Which vibe produced a caption. Every caption row stores its exact prompt,
 * and buildPrompt() always writes a line "Vibe: <label>. …", so the vibe can
 * be read back without an extra column.
 */
export function vibeFromPrompt(prompt: string | null | undefined): Vibe | null {
  if (!prompt) return null;
  const m = prompt.match(/^Vibe: (.+?)\. /m);
  if (!m) return null;
  return VIBE_KEYS.find((k) => VIBES[k].label === m[1]) ?? null;
}

/**
 * One theme per day. Gives users a reason to come back tomorrow and makes
 * the "Top today" board a fair fight (everyone answers the same prompt).
 */
const THEMES = [
  "Your most unhinged subway moment",
  "The dining hall vs. the $18 salad",
  "First time at a place every New Yorker says is 'overrated'",
  "Dorm room at 2am",
  "Lost in Brooklyn (again)",
  "A tourist photo you took but will never post",
  "Weekend you told your parents you 'studied'",
  "The $1 pizza slice that changed you",
  "Central Park but make it Midwestern",
  "Bodega cat appreciation post",
  "Trying to look like a local in Washington Square Park",
  "Library at 11:59pm, assignment due at midnight",
  "The one Brooklyn Bridge selfie everyone takes",
  "Rooftop? No. Fire escape? Yes.",
];

function nyParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    y: get("year"),
    m: get("month") - 1,
    d: get("day"),
    hh: get("hour") % 24,
    mm: get("minute"),
    ss: get("second"),
  };
}

export function todaysTheme(date = new Date()): string {
  // Day-of-year in New York time, so the theme flips at midnight for students.
  const { y, m, d } = nyParts(date);
  const day = Math.floor((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / 86_400_000);
  return THEMES[day % THEMES.length];
}

/** Tomorrow's theme, shown as a teaser so people know there is a reason to come back. */
export function tomorrowsTheme(date = new Date()): string {
  return todaysTheme(new Date(date.getTime() + 86_400_000));
}

/** "Tuesday, October 13" in New York time, plus the day of month for the bullet. */
export function todayLabelNY(date = new Date()): { long: string; dayOfMonth: number } {
  const long = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
  return { long, dayOfMonth: nyParts(date).d };
}

/** Start of "today" in New York, as an ISO string, for the Top-today query. */
export function startOfTodayNY(date = new Date()): string {
  const { y, m, d, hh, mm, ss } = nyParts(date);
  // NY wall-clock "now" interpreted as UTC, minus real UTC now = NY's offset.
  const wallNowAsUtc = Date.UTC(y, m, d, hh, mm, ss);
  const offsetMs = Math.round((wallNowAsUtc - date.getTime()) / 60_000) * 60_000;
  return new Date(Date.UTC(y, m, d) - offsetMs).toISOString();
}
