/**
 * Caption "vibes" the user picks from, and the daily theme rotation.
 * Shared by server and client code, so no Node-only imports here.
 *
 * The concept: every caption speaks in one of the voices of the NYC subway, and
 * each voice is drawn as a real line bullet in that line's official colour
 * (1 red, G lime, A blue, L grey, R yellow). Week-4 vibes are kept as `legacy`
 * so old posts still render, but they are no longer offered.
 */

type VibeDef = {
  label: string;
  bullet: { letter: string; bg: string; fg: string };
  /** One line under the label in the picker. */
  blurb: string;
  /** A sample caption shown in the picker so people know what they'll get. */
  sample: string;
  instruction: string;
  legacy?: boolean;
};

export const VIBES = {
  conductor: {
    label: "Conductor",
    bullet: { letter: "1", bg: "#ee352e", fg: "#ffffff" },
    blurb: "Your moment as a crackly train announcement.",
    sample: "This is a Butler-bound student. Stand clear of the closing deadline, please.",
    instruction:
      "Write each caption as an NYC subway conductor's announcement over the train PA about this moment. Use real announcement patterns ('This is a Manhattan-bound 1 train', 'The next stop is…', 'Stand clear of the closing doors, please', 'We are being held momentarily by the train's dispatcher', 'Please be advised'). Deadpan and official; the joke lands on the specific detail.",
  },
  "service-alert": {
    label: "Service alert",
    bullet: { letter: "G", bg: "#6cbe45", fg: "#16181a" },
    blurb: "An MTA notice about your life.",
    sample: "Delays: Your sleep schedule is running with delays because of an earlier incident at Mel's.",
    instruction:
      "Write each caption as an MTA service alert about the poster's situation, using real formats: 'Delays: [thing] is running with delays because of [specific cause]', 'Planned work: …', 'Some [trains] are skipping [stop] because …', 'Good service on …'. Dry, bureaucratic, very specific.",
  },
  showtime: {
    label: "Showtime",
    bullet: { letter: "A", bg: "#0039a6", fg: "#ffffff" },
    blurb: "Subway-performer hype for the whole car.",
    sample: "What time is it? Showtime! Ladies and gentlemen, this man waited 45 minutes for one cookie.",
    instruction:
      "Write each caption as a subway performer hyping the whole car about this moment ('What time is it? Showtime!', 'Ladies and gentlemen…', 'Hold on to the pole…'). Loud, celebratory, slightly chaotic. Do not write the whole caption in capitals.",
  },
  overheard: {
    label: "Overheard",
    bullet: { letter: "L", bg: "#a7a9ac", fg: "#16181a" },
    blurb: "One line a stranger said on the train.",
    sample: "\u201cBabe, nobody waits 45 minutes for a cookie unless they're new here.\u201d \u2014 overheard on the L",
    instruction:
      "Write each caption as one line a stranger on the train said about this moment, in double quotes, followed by ' — overheard on the [line letter or number] train'. Deadpan, specific, real New York voice.",
  },
  roast: {
    label: "Roast me",
    bullet: { letter: "R", bg: "#fccc0a", fg: "#16181a" },
    blurb: "Roasts the situation, never the person.",
    sample: "45 minutes for a cookie. The 1 train comes faster and it's under construction.",
    instruction:
      "Lovingly roast the person posting this. Sharp, specific, never cruel about appearance or identity: roast the situation, the choices, the NYC-newbie energy. Subway references welcome.",
  },

  // Week 4 vibes: still rendered on old posts, not offered any more.
  "chronically-online": {
    label: "Chronically online",
    bullet: { letter: "O", bg: "#b933ad", fg: "#ffffff" },
    blurb: "Lowercase, deadpan, internet-brained.",
    sample: "",
    instruction:
      "Write like someone who lives on TikTok and X: lowercase, deadpan, uses current internet slang naturally (not cringe), no hashtags.",
    legacy: true,
  },
  "midwest-nice": {
    label: "Midwest nice",
    bullet: { letter: "M", bg: "#ff6319", fg: "#ffffff" },
    blurb: "Polite, overwhelmed, a little \u201cope\u201d.",
    sample: "",
    instruction:
      "Write as a very polite Midwesterner who is overwhelmed by New York City but trying to be positive about it. Wholesome, a little naive, 'ope'-energy.",
    legacy: true,
  },
  "main-character": {
    label: "Main character",
    bullet: { letter: "C", bg: "#0039a6", fg: "#ffffff" },
    blurb: "The opening scene of your NYC movie.",
    sample: "",
    instruction:
      "Write as if this moment is the opening scene of a coming-of-age movie set in New York. Dramatic, cinematic, slightly self-aware.",
    legacy: true,
  },
} satisfies Record<string, VibeDef>;

export type Vibe = keyof typeof VIBES;

const ALL_VIBES = Object.keys(VIBES) as Vibe[];

/** The voices offered in the picker (legacy week-4 vibes excluded). */
export const VIBE_KEYS = ALL_VIBES.filter((k) => !(VIBES[k] as VibeDef).legacy);

export const DEFAULT_VIBE: Vibe = "conductor";

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
  return ALL_VIBES.find((k) => VIBES[k].label === m[1]) ?? null;
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
