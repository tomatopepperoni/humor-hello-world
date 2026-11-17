import "server-only";
import { getPostsSince } from "@/lib/posts";
import { weekStartNY } from "@/lib/race";
import { VIBE_KEYS, isVibe, type Vibe } from "@/lib/vibes";

/** How one subway voice is doing this week. */
export type VoicePulse = {
  vibe: Vibe;
  memes: number;
  upvotes: number;
  /** its best-scoring caption this week, if any has a positive score */
  best: { captionId: string; postId: string; text: string; score: number } | null;
};

/** This week's activity (since Monday 00:00 New York time), for the home card and the leaderboard. */
export type WeekPulse = {
  posts: number;
  memes: number;
  /** up + down votes on this week's memes */
  votes: number;
  posters: number;
  /** the five current voices, most upvoted first */
  voices: VoicePulse[];
};

export async function getWeekPulse(): Promise<WeekPulse> {
  const posts = await getPostsSince(weekStartNY());
  const byVoice = new Map<Vibe, VoicePulse>(VIBE_KEYS.map((v) => [v, { vibe: v, memes: 0, upvotes: 0, best: null }]));
  let memes = 0;
  let votes = 0;

  for (const p of posts) {
    const postVibe = isVibe(p.vibe) ? p.vibe : null;
    for (const c of p.captions) {
      memes += 1;
      votes += c.upvotes + c.downvotes;
      const voice = c.vibe ?? postVibe;
      const row = voice ? byVoice.get(voice) : undefined;
      if (!row) continue; // week-4 vibes are not ranked
      row.memes += 1;
      row.upvotes += c.upvotes;
      if (c.score > 0 && (!row.best || c.score > row.best.score)) {
        row.best = { captionId: c.id, postId: p.id, text: c.text, score: c.score };
      }
    }
  }

  return {
    posts: posts.length,
    memes,
    votes,
    posters: new Set(posts.map((p) => p.user_id)).size,
    voices: [...byVoice.values()].sort((a, b) => b.upvotes - a.upvotes || b.memes - a.memes),
  };
}
