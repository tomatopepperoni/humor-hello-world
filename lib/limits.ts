import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { startOfTodayNY } from "@/lib/vibes";

/**
 * Cost control for the Gemini API: each "run" (a new post, or "write 3 more")
 * is one request that writes 3 captions. On a paid key this caps what one
 * account can spend per day. Override with DAILY_CAPTION_RUNS.
 */
export const DAILY_RUNS = Math.max(1, Number(process.env.DAILY_CAPTION_RUNS) || 10);
const CAPTIONS_PER_RUN = 3;

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/** How many caption runs this user has left today (resets at midnight New York time). */
export async function runsLeftToday(supabase: SupabaseServer, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("captions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfTodayNY());
  if (error) return DAILY_RUNS; // don't block people because a count failed
  const used = Math.ceil((count ?? 0) / CAPTIONS_PER_RUN);
  return Math.max(0, DAILY_RUNS - used);
}
