import { getRecentPosts } from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";
import { VIBES, isVibe } from "@/lib/vibes";

export const dynamic = "force-dynamic";

/** One caption served at a station in Ride mode. */
export type RideStop = {
  captionId: string;
  postId: string;
  text: string;
  imageUrl: string | null;
  context: string | null;
  author: string;
  voice: { label: string; letter: string; bg: string; fg: string } | null;
};

const MAX_STOPS = 30;

/**
 * Ride mode's queue: captions by other people that the signed-in rider hasn't
 * voted on yet. One caption per post first (so the ride shows different
 * photos), then the rest. Each vote on one of these is one stop uptown.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return Response.json({ signedIn: false, queue: [] }, { headers: { "Cache-Control": "no-store" } });

    const posts = (await getRecentPosts(40)).filter((p) => p.user_id !== data.user!.id);
    const first: RideStop[] = [];
    const rest: RideStop[] = [];
    for (const p of posts) {
      const raw = p.author?.first_name ?? "Someone";
      const author = raw === raw.toUpperCase() && raw.length > 1 ? raw[0] + raw.slice(1).toLowerCase() : raw;
      const postVibe = isVibe(p.vibe) ? p.vibe : null;
      const open = p.captions.filter((c) => c.my_vote === 0).sort((a, b) => a.position - b.position);
      open.forEach((c, i) => {
        const v = c.vibe ?? postVibe;
        const b = v ? VIBES[v].bullet : null;
        const stop: RideStop = {
          captionId: c.id,
          postId: p.id,
          text: c.text,
          imageUrl: p.image_url,
          context: p.context,
          author,
          voice: v && b ? { label: VIBES[v].label, letter: b.letter, bg: b.bg, fg: b.fg } : null,
        };
        (i === 0 ? first : rest).push(stop);
      });
    }
    return Response.json({ signedIn: true, queue: [...first, ...rest].slice(0, MAX_STOPS) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ signedIn: true, queue: [], error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
