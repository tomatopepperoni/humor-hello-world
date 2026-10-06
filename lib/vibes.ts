/**
 * Caption "vibes" the user picks from, and the daily theme rotation.
 * Shared by server and client code, so no Node-only imports here.
 */

export const VIBES = {
  "chronically-online": {
    label: "Chronically online",
    emoji: "📱",
    instruction:
      "Write like someone who lives on TikTok and X: lowercase, deadpan, uses current internet slang naturally (not cringe), no hashtags.",
  },
  roast: {
    label: "Roast me",
    emoji: "🔥",
    instruction:
      "Lovingly roast the person posting this. Sharp, specific, never cruel about appearance or identity – roast the situation, the choices, the NYC-newbie energy.",
  },
  "midwest-nice": {
    label: "Midwest nice",
    emoji: "🌽",
    instruction:
      "Write as a very polite Midwesterner who is overwhelmed by New York City but trying to be positive about it. Wholesome, a little naive, 'ope'-energy.",
  },
  "main-character": {
    label: "Main character",
    emoji: "🎬",
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

export function todaysTheme(date = new Date()): string {
  // Day-of-year in New York time, so the theme flips at midnight for students.
  const ny = new Date(
    date.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const start = new Date(ny.getFullYear(), 0, 0);
  const day = Math.floor((ny.getTime() - start.getTime()) / 86_400_000);
  return THEMES[day % THEMES.length];
}

/** Start of "today" in New York, as an ISO string, for the Top-today query. */
export function startOfTodayNY(date = new Date()): string {
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
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const y = get("year");
  const m = get("month") - 1;
  const d = get("day");
  // NY wall-clock "now" interpreted as UTC, minus real UTC now = NY's offset.
  const wallNowAsUtc = Date.UTC(y, m, d, get("hour") % 24, get("minute"), get("second"));
  const offsetMs = Math.round((wallNowAsUtc - date.getTime()) / 60_000) * 60_000;
  return new Date(Date.UTC(y, m, d) - offsetMs).toISOString();
}
