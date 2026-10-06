import { createClient } from "@/lib/supabase/server";
import { startOfTodayNY } from "@/lib/vibes";

export type Author = {
  id: string;
  first_name: string | null;
  avatar_url: string | null;
};

export type CaptionWithScore = {
  id: string;
  post_id: string;
  text: string;
  prompt: string;
  model: string;
  position: number;
  created_at: string;
  upvotes: number;
  downvotes: number;
  score: number;
  /** +1 / -1 / 0 for the current viewer */
  my_vote: number;
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
};

type CaptionRow = {
  id: string;
  post_id: string;
  text: string;
  prompt: string;
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
          upvotes: s?.upvotes ?? 0,
          downvotes: s?.downvotes ?? 0,
          score: s?.score ?? 0,
          my_vote: myVotes.get(c.id) ?? 0,
        };
      });
    return {
      ...p,
      author: authors.get(p.user_id) ?? null,
      captions,
      total_score: captions.reduce((sum, c) => sum + c.score, 0),
    };
  });
}

const POST_SELECT =
  "id, user_id, image_url, image_path, context, vibe, theme, created_at, captions ( id, post_id, text, prompt, model, position, created_at )";

export async function getRecentPosts(limit = 20): Promise<PostWithCaptions[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return hydrate((data ?? []) as PostRow[]);
}

export async function getPost(id: string): Promise<PostWithCaptions | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [post] = await hydrate([data as PostRow]);
  return post ?? null;
}

/** Posts created today (NY time), ranked by total caption score. */
export async function getTopPostsToday(limit = 5): Promise<PostWithCaptions[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .gte("created_at", startOfTodayNY())
    .order("created_at", { ascending: false })
    .limit(100);
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

  const { data: posts, error: postErr } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .in("id", postIds);
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
