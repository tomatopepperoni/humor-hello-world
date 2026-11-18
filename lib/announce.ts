import { STATIONS, STOPS_TO_COLUMBIA } from "@/lib/line1";

/**
 * Text of a conductor-style announcement for a rider at `station` (index into
 * STATIONS). Written for a speech synthesiser: "St" is spelled out, and numbered
 * streets are ordinals ("116th Street"), the way they're said on the train.
 */
export function announcementFor(station: number): string {
  const at = Math.max(0, Math.min(station, STOPS_TO_COLUMBIA));
  if (at >= STOPS_TO_COLUMBIA) {
    return `This is ${spoken(STATIONS[STOPS_TO_COLUMBIA])}. This is the last stop on this train. You made it to Columbia this week.`;
  }
  return `This is a Columbia-bound 1 train. The next stop is ${spoken(STATIONS[at + 1])}. Stand clear of the closing doors, please.`;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function spoken(name: string): string {
  return name
    .replace(/(\d+) St\b/g, (_, n: string) => `${ordinal(Number(n))} Street`)
    .replace(/\bSt\b/g, "Street")
    .replace(/\bSq\b/g, "Square")
    .replace(/\bPkwy\b/g, "Parkway")
    .replace(/\bWTC\b/g, "World Trade Center")
    .replace(/–/g, ", ");
}
