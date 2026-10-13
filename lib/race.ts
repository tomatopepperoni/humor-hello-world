import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Race to Columbia: a weekly race up the 1 train, South Ferry → 116 St–Columbia.
 *   +1 stop for every caption you vote on
 *   +2 stops for every post
 *   +1 stop for every upvote someone else gives your captions
 * Totals come from the rider_stats view (supabase/week5_race.sql). If that view
 * hasn't been installed yet, a rougher estimate is built from public tables so
 * the page still works.
 */

export const STATIONS = [
  "South Ferry",
  "Rector St",
  "WTC Cortlandt",
  "Chambers St",
  "Franklin St",
  "Canal St",
  "Houston St",
  "Christopher St–Stonewall",
  "14 St",
  "18 St",
  "23 St",
  "28 St",
  "34 St–Penn Station",
  "Times Sq–42 St",
  "50 St",
  "59 St–Columbus Circle",
  "66 St–Lincoln Center",
  "72 St",
  "79 St",
  "86 St",
  "96 St",
  "103 St",
  "Cathedral Pkwy–110 St",
  "116 St–Columbia University",
] as const;

export const STOPS_TO_COLUMBIA = STATIONS.length - 1; // 23

export type Rider = {
  user_id: string;
  first_name: string | null;
  avatar_url: string | null;
  points_week: number;
  arrived_at: string | null;
  votes_week: number;
  votes_all: number;
  posts_week: number;
  posts_all: number;
  upvotes_received_week: number;
  upvotes_received_all: number;
  best_caption_score: number;
  /** index into STATIONS */
  station: number;
};

export type Race = {
  riders: Rider[];
  /** false when the rider_stats view is missing and totals are estimated */
  exact: boolean;
  weekStart: string;
};

/** Monday 00:00 New York time, as ISO. */
export function weekStartNY(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month")) - 1;
  const d = Number(get("day"));
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  const wallNowAsUtc = Date.UTC(y, m, d, Number(get("hour")) % 24, Number(get("minute")), Number(get("second")));
  const offsetMs = Math.round((wallNowAsUtc - now.getTime()) / 60_000) * 60_000;
  return new Date(Date.UTC(y, m, d - dow) - offsetMs).toISOString();
}

const stationFor = (points: number) => Math.max(0, Math.min(points, STOPS_TO_COLUMBIA));

function rank(riders: Rider[]): Rider[] {
  return riders.sort((a, b) => {
    if (a.arrived_at && b.arrived_at) return a.arrived_at.localeCompare(b.arrived_at);
    if (a.arrived_at) return -1;
    if (b.arrived_at) return 1;
    return b.points_week - a.points_week;
  });
}

export async function getRace(): Promise<Race> {
  const supabase = await createClient();
  const weekStart = weekStartNY();

  const { data, error } = await supabase.from("rider_stats").select("*");
  if (!error && data) {
    const riders = (data as Omit<Rider, "station">[]).map((r) => ({ ...r, station: stationFor(r.points_week) }));
    return { riders: rank(riders), exact: true, weekStart };
  }

  // Fallback (view not installed): posts this week + net score of their captions.
  const [{ data: posts }, { data: profiles }] = await Promise.all([
    supabase.from("posts").select("id, user_id, created_at, captions ( id )").gte("created_at", weekStart),
    supabase.from("public_profiles").select("id, first_name, avatar_url"),
  ]);
  const captionIds = (posts ?? []).flatMap((p) => (p.captions as { id: string }[]).map((c) => c.id));
  const { data: scores } = captionIds.length
    ? await supabase.from("caption_scores").select("caption_id, upvotes, score").in("caption_id", captionIds)
    : { data: [] as { caption_id: string; upvotes: number; score: number }[] };
  const byCaption = new Map((scores ?? []).map((s) => [s.caption_id, s] as const));

  const totals = new Map<string, { posts: number; ups: number; best: number }>();
  for (const p of posts ?? []) {
    const t = totals.get(p.user_id) ?? { posts: 0, ups: 0, best: 0 };
    t.posts += 1;
    for (const c of p.captions as { id: string }[]) {
      const s = byCaption.get(c.id);
      t.ups += s?.upvotes ?? 0;
      t.best = Math.max(t.best, s?.score ?? 0);
    }
    totals.set(p.user_id, t);
  }
  const riders: Rider[] = (profiles ?? []).map((pr) => {
    const t = totals.get(pr.id) ?? { posts: 0, ups: 0, best: 0 };
    const points = 2 * t.posts + t.ups;
    return {
      user_id: pr.id,
      first_name: pr.first_name,
      avatar_url: pr.avatar_url,
      points_week: points,
      arrived_at: null,
      votes_week: 0,
      votes_all: 0,
      posts_week: t.posts,
      posts_all: t.posts,
      upvotes_received_week: t.ups,
      upvotes_received_all: t.ups,
      best_caption_score: t.best,
      station: stationFor(points),
    };
  });
  return { riders: rank(riders), exact: false, weekStart };
}

/* ---------- badges ---------- */

export type Badge = {
  id: string;
  label: string;
  glyph: string;
  how: string;
  earned: (r: Rider) => boolean;
};

/** Badges reward rating as much as posting: three of five are about voting or being voted on. */
export const BADGES: Badge[] = [
  { id: "first-ride", label: "First ride", glyph: "1", how: "Post your first moment", earned: (r) => r.posts_all >= 1 },
  { id: "straphanger", label: "Straphanger", glyph: "S", how: "Vote on 10 captions", earned: (r) => r.votes_all >= 10 },
  { id: "rush-hour", label: "Rush hour", glyph: "R", how: "Vote on 50 captions", earned: (r) => r.votes_all >= 50 },
  { id: "crowd-pleaser", label: "Crowd pleaser", glyph: "★", how: "Get one caption to +5", earned: (r) => r.best_caption_score >= 5 },
  {
    id: "columbia",
    label: "Made it to Columbia",
    glyph: "C",
    how: "Reach 116 St in one week",
    earned: (r) => r.arrived_at !== null || r.points_week >= STOPS_TO_COLUMBIA,
  },
];

export function badgesFor(r: Rider | undefined): Badge[] {
  return r ? BADGES.filter((b) => b.earned(r)) : [];
}
