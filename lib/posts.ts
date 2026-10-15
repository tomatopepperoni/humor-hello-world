import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isUsableCaption, tidyCaption } from "@/lib/caption-text";
import { isVibe, startOfTodayNY, vibeFromPrompt, type Vibe } from "@/lib/vibes";

export type Author = {
  id: string;
  first_name: string | null;
  avatar_url: string | null;
};

export type CaptionWithScore = {
  id: string;
  post_id: string;
  text: string;
  /** only present before supabase/week5.sql hides the column */
  prompt?: string | null;
  model: string;
  position: number;
  created_at: string;
  upvotes: number;
  downvotes: number;
  score: number;
  /** +1 / -1 / 0 for the current viewer */
  my_vote: number;
  /** voice this caption was written in (captions.vibe, or read back from the prompt on old rows) */
  vibe: Vibe | null;
};

export type PostWithCaptions = {
  id: string;
  user_id: string;
  image_url: string | null;
  image_path: string | null;
  context: string | null;
  vibe: string;
  theme: string | null;
  created_at: string;
  author: Author | null;
  captions: CaptionWithScore[];
  /** sum of caption scores – used for ranking posts */
  total_score: number;
  /** caption with the single highest positive score, if there is one */
  leading_caption_id: string | null;
  /** true when the viewer has voted on at least one caption of this post */
  voted_by_me: boolean;
};

type CaptionRow = {
  vibe?: string | null;
  id: string;
  post_id: string;
  text: string;
  prompt?: string | null;
  model: string;
  position: number;
  created_at: string;
};

type PostRow = {
  id: string;
  user_id: string;
  image_url: string | null;
  image_path: string | null;
  context: string | null;
  vibe: string;
  theme: string | null;
  created_at: string;
  captions: CaptionRow[];
};

/**
 * Loads posts + captions, then joins scores (caption_scores view), the viewer's
 * own votes (votes table, RLS = own rows only) and author names
 * (public_profiles view). Three small queries instead of one deep join keeps
 * the RLS rules simple.
 */
async function hydrate(posts: PostRow[]): Promise<PostWithCaptions[]> {
  if (posts.length === 0) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const captionIds = posts.flatMap((p) => p.captions.map((c) => c.id));
  const authorIds = Array.from(new Set(posts.map((p) => p.user_id)));

  const [scoresRes, votesRes, authorsRes] = await Promise.all([
    captionIds.length
      ? supabase
          .from("caption_scores")
          .select("caption_id, upvotes, downvotes, score")
          .in("caption_id", captionIds)
      : Promise.resolve({ data: [] as { caption_id: string; upvotes: number; downvotes: number; score: number }[] }),
    user && captionIds.length
      ? supabase.from("votes").select("caption_id, value").in("caption_id", captionIds)
      : Promise.resolve({ data: [] as { caption_id: string; value: number }[] }),
    supabase.from("public_profiles").select("id, first_name, avatar_url").in("id", authorIds),
  ]);

  const scores = new Map(
    (scoresRes.data ?? []).map((s) => [s.caption_id, s] as const)
  );
  const myVotes = new Map(
    (votesRes.data ?? []).map((v) => [v.caption_id, v.value] as const)
  );
  const authors = new Map(
    ((authorsRes.data ?? []) as Author[]).map((a) => [a.id, a] as const)
  );

  return posts.map((p) => {
    const captions = [...p.captions]
      .sort((a, b) => a.position - b.position)
      .map((c) => {
        const s = scores.get(c.id);
        return {
          ...c,
          // Week-4 rows written before the truncation fix can contain JSON debris.
          text: tidyCaption(c.text),
          upvotes: s?.upvotes ?? 0,
          downvotes: s?.downvotes ?? 0,
          score: s?.score ?? 0,
          my_vote: myVotes.get(c.id) ?? 0,
          vibe: isVibe(c.vibe) ? c.vibe : vibeFromPrompt(c.prompt),
        };
      })
      .filter((c) => isUsableCaption(c.text));

    const best = Math.max(0, ...captions.map((c) => c.score));
    const leaders = captions.filter((c) => c.score === best && best > 0);

    return {
      ...p,
      author: authors.get(p.user_id) ?? null,
      captions,
      total_score: captions.reduce((sum, c) => sum + c.score, 0),
      leading_caption_id: leaders.length === 1 ? leaders[0].id : null,
      voted_by_me: captions.some((c) => c.my_vote !== 0),
    };
  });
}

const POST_COLS = "id, user_id, image_url, image_path, context, vibe, theme, created_at";
/** After supabase/week5.sql: prompt is not readable by clients, vibe is its own column. */
const CAPTIONS_V5 = `${POST_COLS}, captions ( id, post_id, text, model, position, created_at, vibe )`;
/** Before the migration: no vibe column, so the voice is read from the prompt. */
const CAPTIONS_V4 = `${POST_COLS}, captions ( id, post_id, text, model, position, created_at, prompt )`;

let schemaV5: boolean | null = null; // learned at runtime, per server instance

type Res = { data: unknown; error: { code?: string; message: string } | null };

/** Column missing (before migration) or not readable (after it): try the other shape. */
const wrongShape = (e: { code?: string; message: string }) =>
  e.code === "42703" || e.code === "42501" || e.code === "PGRST204" || /column|permission denied/i.test(e.message);

/**
 * Runs a posts query with whichever captions columns this database has, so the
 * app works both before and after supabase/week5.sql is run.
 */
async function withPostSelect(run: (select: string) => PromiseLike<Res>): Promise<Res> {
  const first = schemaV5 === false ? CAPTIONS_V4 : CAPTIONS_V5;
  const res = await run(first);
  if (!res.error) {
    schemaV5 = first === CAPTIONS_V5;
    return res;
  }
  if (!wrongShape(res.error)) return res;
  const second = first === CAPTIONS_V5 ? CAPTIONS_V4 : CAPTIONS_V5;
  const retry = await run(second);
  if (!retry.error) schemaV5 = second === CAPTIONS_V5;
  return retry;
}

export async function getRecentPosts(limit = 20): Promise<PostWithCaptions[]> {
  const supabase = await createClient();
  const { data, error } = await withPostSelect((sel) =>
    supabase
      .from("posts")
      .select(sel)
      .order("created_at", { ascending: false })
      .limit(limit)
  );
  if (error) throw new Error(error.message);
  return hydrate((data ?? []) as PostRow[]);
}

/** Cached per request, so generateMetadata and the page share one fetch. */
export const getPost = cache(async function getPost(id: string): Promise<PostWithCaptions | null> {
  const supabase = await createClient();
  const { data, error } = await withPostSelect((sel) =>
    supabase
      .from("posts")
      .select(sel)
      .eq("id", id)
      .maybeSingle()
  );
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [post] = await hydrate([data as PostRow]);
  return post ?? null;
});

/** Everything one user has posted, newest first (for /profile). */
export async function getPostsByUser(userId: string, limit = 50): Promise<PostWithCaptions[]> {
  const supabase = await createClient();
  const { data, error } = await withPostSelect((sel) =>
    supabase
      .from("posts")
      .select(sel)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
  );
  if (error) throw new Error(error.message);
  return hydrate((data ?? []) as PostRow[]);
}

/** Posts created today (NY time), ranked by total caption score. */
export async function getTopPostsToday(limit = 5): Promise<PostWithCaptions[]> {
  const supabase = await createClient();
  const { data, error } = await withPostSelect((sel) =>
    supabase
      .from("posts")
      .select(sel)
      .gte("created_at", startOfTodayNY())
      .order("created_at", { ascending: false })
      .limit(100)
  );
  if (error) throw new Error(error.message);
  const posts = await hydrate((data ?? []) as PostRow[]);
  return posts
    .filter((p) => p.total_score > 0)
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, limit);
}

/** All-time best captions, ranked by caption score. */
export async function getTopCaptionsAllTime(limit = 20) {
  const supabase = await createClient();
  const { data: scores, error } = await supabase
    .from("caption_scores")
    .select("caption_id, score")
    .gt("score", 0)
    .order("score", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const ids = (scores ?? []).map((s) => s.caption_id);
  if (ids.length === 0) return [];

  const { data: caps, error: capErr } = await supabase
    .from("captions")
    .select("post_id")
    .in("id", ids);
  if (capErr) throw new Error(capErr.message);
  const postIds = Array.from(new Set((caps ?? []).map((c) => c.post_id)));

  const { data: posts, error: postErr } = await withPostSelect((sel) =>
    supabase
      .from("posts")
      .select(sel)
      .in("id", postIds)
  );
  if (postErr) throw new Error(postErr.message);
  const hydrated = await hydrate((posts ?? []) as PostRow[]);

  // Flatten to (caption, post) pairs in score order.
  const byCaption = new Map<string, { caption: CaptionWithScore; post: PostWithCaptions }>();
  for (const p of hydrated) for (const c of p.captions) byCaption.set(c.id, { caption: c, post: p });
  return ids.map((id) => byCaption.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
}

export async function getMyStats(userId: string) {
  const supabase = await createClient();
  const [{ count: posts }, { count: votes }] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("votes").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  return { posts: posts ?? 0, votes: votes ?? 0 };
}

/* ---------- memes: one caption + its post's photo = one card ---------- */

/**
 * The feed shows each caption as its own meme (photo + that caption), so every
 * caption is voted on and ranked on its own, and several fit on one screen.
 */
export type Meme = {
  caption: CaptionWithScore;
  post: PostWithCaptions;
  /** 1-based position of this caption among the post's captions */
  index: number;
  total: number;
};

export function toMemes(post: PostWithCaptions): Meme[] {
  const ordered = [...post.captions].sort((a, b) => a.position - b.position);
  return ordered.map((caption, i) => ({ caption, post, index: i + 1, total: ordered.length }));
}

/** Newest posts first; within a post, the best-voted caption first. */
export async function getRecentMemes(postLimit = 12): Promise<{ memes: Meme[]; posts: PostWithCaptions[] }> {
  const posts = await getRecentPosts(postLimit);
  const memes = posts.flatMap((p) =>
    toMemes(p).sort((a, b) => b.caption.score - a.caption.score || a.caption.position - b.caption.position)
  );
  return { memes, posts };
}

/** Today's best memes (posts created today, captions with a positive score). */
export async function getTopMemesToday(limit = 6): Promise<Meme[]> {
  const supabase = await createClient();
  const { data, error } = await withPostSelect((sel) =>
    supabase
      .from("posts")
      .select(sel)
      .gte("created_at", startOfTodayNY())
      .order("created_at", { ascending: false })
      .limit(100)
  );
  if (error) throw new Error(error.message);
  const posts = await hydrate((data ?? []) as PostRow[]);
  return posts
    .flatMap(toMemes)
    .filter((m) => m.caption.score > 0)
    .sort((a, b) => b.caption.score - a.caption.score)
    .slice(0, limit);
}

/** All-time best memes, ranked by caption score. */
export async function getTopMemesAllTime(limit = 12): Promise<Meme[]> {
  const pairs = await getTopCaptionsAllTime(limit);
  return pairs.map(({ caption, post }) => {
    const ordered = [...post.captions].sort((a, b) => a.position - b.position);
    return { caption, post, index: ordered.findIndex((c) => c.id === caption.id) + 1, total: ordered.length };
  });
}

/** Posts created since `iso` (newest first), hydrated. Used for the subway map's traffic. */
export async function getPostsSince(iso: string, limit = 150): Promise<PostWithCaptions[]> {
  const supabase = await createClient();
  const { data, error } = await withPostSelect((sel) =>
    supabase.from("posts").select(sel).gte("created_at", iso).order("created_at", { ascending: false }).limit(limit)
  );
  if (error) throw new Error(error.message);
  return hydrate((data ?? []) as PostRow[]);
}
