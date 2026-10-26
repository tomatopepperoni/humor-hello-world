import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attempt } from "@/lib/gemini";

/**
 * Week 7 observability: one row in generation_requests per caption run and one
 * row in llm_responses per model call inside it (retries and fallbacks
 * included), written through public.log_generation() with the user's session.
 *
 * Logging never breaks the app: if the function is missing (week7 SQL not run
 * yet) or the call fails, we return false and the caller saves the captions
 * without a generation_request_id.
 *
 * Same file in humor-hello-world and humor-admin.
 */

export type GenerationLog = {
  id: string;
  kind: "create" | "more" | "admin";
  app: "caption-app" | "admin";
  vibe: string;
  postId: string | null;
  status: "success" | "failed";
  prompt: string;
  hasImage: boolean;
  model: string | null;
  captionCount: number;
  error: string | null;
  startedAt: Date;
  configSource: "database" | "code";
};

export async function logGeneration(
  supabase: Pick<SupabaseClient, "rpc">,
  log: GenerationLog,
  attempts: Attempt[]
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("log_generation", {
      p_request: {
        id: log.id,
        kind: log.kind,
        app: log.app,
        vibe: log.vibe,
        post_id: log.postId,
        status: log.status,
        prompt: log.prompt,
        has_image: log.hasImage,
        model: log.model,
        caption_count: log.captionCount,
        error: log.error,
        started_at: log.startedAt.toISOString(),
        duration_ms: Date.now() - log.startedAt.getTime(),
        config_source: log.configSource,
      },
      p_responses: attempts,
    });
    if (error) {
      console.warn("log_generation failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("log_generation failed:", err);
    return false;
  }
}
