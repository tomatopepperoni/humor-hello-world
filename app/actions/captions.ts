"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { GeminiError, generateText, parseCaptionList, type Attempt, type ModelSpec } from "@/lib/gemini";
import { DEFAULT_VIBE, VIBES, isVibe, todaysTheme, type Vibe } from "@/lib/vibes";
import { DAILY_RUNS, runsLeftToday } from "@/lib/limits";
import { prepareGeneration } from "@/lib/prompt-chain";
import { logGeneration } from "@/lib/generation-log";
import { getVoiceMix } from "@/lib/voices";

/** `busy`: Gemini was overloaded / rate-limited, so trying again shortly should work. */
export type GenerateState = { error?: string; busy?: boolean; limit?: boolean };

const limitMessage = () =>
  `You've used all ${DAILY_RUNS} caption runs for today. The count resets at midnight New York time, and you can still vote on everyone else's posts.`;

const CAPTIONS_PER_ROUND = 3;
const MAX_CAPTIONS_PER_POST = 9;
const MAX_CONTEXT = 200;

type AskResult =
  | { captions: string[]; model: string; attempts: Attempt[] }
  | { error: string; busy: boolean; attempts: Attempt[] };

async function askGemini(
  prompt: string,
  image: { mimeType: string; base64: string } | undefined,
  models?: ModelSpec[]
): Promise<AskResult> {
  try {
    const { value, model, attempts } = await generateText(
      prompt,
      image,
      (text) => parseCaptionList(text, CAPTIONS_PER_ROUND),
      models
    );
    return { captions: value, model, attempts };
  } catch (err) {
    const msg = err instanceof GeminiError ? err.message : "The caption model is unavailable right now.";
    const status = err instanceof GeminiError ? err.status : undefined;
    const attempts: Attempt[] = err instanceof GeminiError ? err.attempts : [];
    const busy = status === undefined || [408, 429, 500, 502, 503, 504].includes(status);
    return { error: msg, busy, attempts };
  }
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

type CaptionInsert = {
  post_id: string;
  user_id: string;
  text: string;
  prompt: string;
  model: string;
  position: number;
  vibe: Vibe;
  generation_request_id?: string;
};

const OPTIONAL_COLUMNS = ["generation_request_id", "vibe"] as const;

/**
 * Saves captions with their voice (captions.vibe, week 5) and their run
 * (captions.generation_request_id, week 7). If a migration hasn't been run yet,
 * PostgREST rejects the unknown column (PGRST204 / 42703), so drop that key and
 * try again: the captions themselves always get saved.
 */
async function insertCaptions(supabase: SupabaseServer, rows: CaptionInsert[]) {
  let current: Record<string, unknown>[] = rows.map((r) => ({ ...r }));
  for (;;) {
    const { error } = await supabase.from("captions").insert(current);
    if (!error) return null;
    const present = OPTIONAL_COLUMNS.filter((c) => current.some((r) => c in r));
    const named = present.find((c) => error.message.includes(c));
    const unknownColumn = error.code === "PGRST204" || error.code === "42703";
    const drop = named ?? (unknownColumn ? present[0] : undefined);
    if (!drop) return error;
    // Drop the key entirely: supabase-js lists every key it sees as a column.
    current = current.map((row) => {
      const copy = { ...row };
      delete copy[drop];
      return copy;
    });
  }
}

async function downloadImage(supabase: SupabaseServer, path: string) {
  const { data: blob, error } = await supabase.storage.from("photos").download(path);
  if (error || !blob) return { error: `Could not read the uploaded photo: ${error?.message ?? "unknown"}` };
  const buf = Buffer.from(await blob.arrayBuffer());
  return { image: { mimeType: blob.type || "image/jpeg", base64: buf.toString("base64") } };
}

/**
 * Server action: create a post, call Gemini, save the captions.
 * Flow: the browser has already uploaded the image to the "photos" bucket
 * (RLS: own folder only) and hands us its storage path + public URL.
 *
 * Week 7: the prompt + model list come from the database (prompt chains,
 * terms, examples, llm_models), and the run is logged (generation_requests +
 * one llm_responses row per model call) before the captions are saved, so
 * each caption can point at the run that wrote it.
 */
export async function generateCaptions(
  _prev: GenerateState,
  formData: FormData
): Promise<GenerateState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/create");

  const vibeRaw = String(formData.get("vibe") ?? "");
  const vibe = isVibe(vibeRaw) ? vibeRaw : DEFAULT_VIBE;
  const context = String(formData.get("context") ?? "").trim().slice(0, MAX_CONTEXT) || null;
  const imagePath = String(formData.get("image_path") ?? "").trim() || null;
  const imageUrl = String(formData.get("image_url") ?? "").trim() || null;
  const useTheme = formData.get("use_theme") === "on";
  const theme = useTheme ? todaysTheme() : null;

  if (!context && !imagePath) {
    return { error: "Add a photo or describe the moment, then try again." };
  }
  // Never trust a client-supplied path outside the user's own folder.
  if (imagePath && !imagePath.startsWith(`${user.id}/`)) {
    return { error: "That photo upload can't be used. Upload it again." };
  }
  const mix = await getVoiceMix(supabase);
  if (!mix.enabled.includes(vibe)) {
    return { error: `The ${VIBES[vibe].label} voice is switched off right now. Pick another one.` };
  }

  if ((await runsLeftToday(supabase, user.id)) <= 0) return { error: limitMessage(), limit: true };

  // 1. Fetch the uploaded image (if any) for the multimodal prompt.
  let image: { mimeType: string; base64: string } | undefined;
  if (imagePath) {
    const dl = await downloadImage(supabase, imagePath);
    if ("error" in dl) return { error: dl.error };
    image = dl.image;
  }

  // 2. Build the prompt from the voice's chain and ask Gemini
  //    (retries + model fallback + output validation live in lib/gemini).
  const startedAt = new Date();
  const gen = await prepareGeneration(supabase, {
    vibe,
    count: CAPTIONS_PER_ROUND,
    context,
    hasImage: !!image,
    theme,
    avoid: [],
  });
  const prompt = gen.prompt;
  const ai = await askGemini(prompt, image, gen.models);

  // 3. Log the run (success or not). Ids are made here so the log, the post
  //    and the captions can point at each other without extra round trips.
  const requestId = randomUUID();
  const postId = randomUUID();
  const logged = await logGeneration(
    supabase,
    {
      id: requestId,
      kind: "create",
      app: "caption-app",
      vibe,
      postId: "error" in ai ? null : postId,
      status: "error" in ai ? "failed" : "success",
      prompt,
      hasImage: !!image,
      model: "error" in ai ? null : ai.model,
      captionCount: "error" in ai ? 0 : ai.captions.length,
      error: "error" in ai ? ai.error : null,
      startedAt,
      configSource: gen.configSource,
    },
    ai.attempts
  );
  if ("error" in ai) return { error: ai.error, busy: ai.busy };

  // 4. Save post + captions (RLS: user_id must equal auth.uid()).
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .insert({ id: postId, user_id: user.id, image_url: imageUrl, image_path: imagePath, context, vibe, theme })
    .select("id")
    .single();
  if (postErr || !post) return { error: postErr?.message ?? "Could not save the post." };

  const capErr = await insertCaptions(
    supabase,
    ai.captions.map((text, position) => ({
      post_id: post.id,
      user_id: user.id,
      text,
      prompt,
      model: ai.model,
      position,
      vibe,
      ...(logged ? { generation_request_id: requestId } : {}),
    }))
  );
  if (capErr) {
    await supabase.from("posts").delete().eq("id", post.id);
    return { error: capErr.message };
  }

  revalidatePath("/");
  revalidatePath("/top");
  redirect(`/p/${post.id}?new=1`);
}

export type MoreState = { error?: string; busy?: boolean; limit?: boolean; added?: number; at?: number };

/**
 * Server action: the post's owner asks for 3 more captions, optionally in a
 * different vibe. New rows are appended after the existing ones; the prompt
 * lists the existing captions so the model doesn't repeat them.
 */
export async function addCaptions(_prev: MoreState, formData: FormData): Promise<MoreState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to add captions." };

  const postId = String(formData.get("post_id") ?? "");
  const vibeRaw = String(formData.get("vibe") ?? "");
  const vibe: Vibe = isVibe(vibeRaw) ? vibeRaw : DEFAULT_VIBE;

  const { data: post } = await supabase
    .from("posts")
    .select("id, user_id, image_path, context, theme, captions ( text, position )")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { error: "This post no longer exists." };
  if (post.user_id !== user.id) return { error: "Only the person who posted this can add captions." };

  const existing = (post.captions ?? []) as { text: string; position: number }[];
  if (existing.length >= MAX_CAPTIONS_PER_POST) {
    return { error: `A post can have up to ${MAX_CAPTIONS_PER_POST} captions. Delete it and post again for a fresh set.` };
  }
  const mix = await getVoiceMix(supabase);
  if (!mix.enabled.includes(vibe)) {
    return { error: `The ${VIBES[vibe].label} voice is switched off right now. Pick another one.` };
  }

  if ((await runsLeftToday(supabase, user.id)) <= 0) return { error: limitMessage(), limit: true };

  let image: { mimeType: string; base64: string } | undefined;
  if (post.image_path) {
    const dl = await downloadImage(supabase, post.image_path);
    if ("error" in dl) return { error: dl.error };
    image = dl.image;
  }

  const startedAt = new Date();
  const gen = await prepareGeneration(supabase, {
    vibe,
    count: CAPTIONS_PER_ROUND,
    context: post.context,
    hasImage: !!image,
    theme: post.theme,
    avoid: existing.map((c) => c.text),
  });
  const prompt = gen.prompt;
  const ai = await askGemini(prompt, image, gen.models);

  const requestId = randomUUID();
  const room = MAX_CAPTIONS_PER_POST - existing.length;
  const logged = await logGeneration(
    supabase,
    {
      id: requestId,
      kind: "more",
      app: "caption-app",
      vibe,
      postId: post.id,
      status: "error" in ai ? "failed" : "success",
      prompt,
      hasImage: !!image,
      model: "error" in ai ? null : ai.model,
      captionCount: "error" in ai ? 0 : Math.min(room, ai.captions.length),
      error: "error" in ai ? ai.error : null,
      startedAt,
      configSource: gen.configSource,
    },
    ai.attempts
  );
  if ("error" in ai) return { error: ai.error, busy: ai.busy };

  const start = existing.reduce((max, c) => Math.max(max, c.position), -1) + 1;
  const rows = ai.captions.slice(0, room).map((text, i) => ({
    post_id: post.id,
    user_id: user.id,
    text,
    prompt,
    model: ai.model,
    position: start + i,
    vibe,
    ...(logged ? { generation_request_id: requestId } : {}),
  }));
  const error = await insertCaptions(supabase, rows);
  if (error) return { error: error.message };

  revalidatePath(`/p/${post.id}`);
  revalidatePath("/");
  return { added: rows.length, at: Date.now() };
}

export type VoteResult = { error?: string; my_vote?: number; upvotes?: number; downvotes?: number; score?: number };

/**
 * Server action: upvote / downvote a caption.
 *  - clicking the same arrow again removes the vote (delete)
 *  - switching arrows updates the row
 *  - otherwise a new row is inserted
 * All three go through RLS, which only lets you touch rows where user_id = auth.uid().
 */
export async function vote(captionId: string, value: 1 | -1): Promise<VoteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to vote." };
  if (value !== 1 && value !== -1) return { error: "Invalid vote." };

  const { data: existing, error: readErr } = await supabase
    .from("votes")
    .select("id, value")
    .eq("caption_id", captionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) return { error: readErr.message };

  let my_vote: number;
  if (existing && existing.value === value) {
    const { error } = await supabase.from("votes").delete().eq("id", existing.id);
    if (error) return { error: error.message };
    my_vote = 0;
  } else if (existing) {
    const { error } = await supabase.from("votes").update({ value }).eq("id", existing.id);
    if (error) return { error: error.message };
    my_vote = value;
  } else {
    const { error } = await supabase
      .from("votes")
      .insert({ caption_id: captionId, user_id: user.id, value });
    if (error) return { error: error.message };
    my_vote = value;
  }

  // Read the totals back from the database so the buttons show what was saved.
  const { data: totals } = await supabase
    .from("caption_scores")
    .select("upvotes, downvotes, score")
    .eq("caption_id", captionId)
    .maybeSingle();

  revalidatePath("/");
  revalidatePath("/top");
  revalidatePath("/race");
  revalidatePath("/profile");
  revalidatePath("/p/[id]", "page");
  return {
    my_vote,
    upvotes: totals?.upvotes ?? 0,
    downvotes: totals?.downvotes ?? 0,
    score: totals?.score ?? 0,
  };
}

/** Server action: delete one of your own posts (captions + votes cascade). */
export async function deletePost(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("post_id") ?? "");
  const { data: post } = await supabase
    .from("posts")
    .select("id, user_id, image_path")
    .eq("id", id)
    .maybeSingle();
  if (!post || post.user_id !== user.id) redirect("/");

  if (post.image_path) {
    await supabase.storage.from("photos").remove([post.image_path]);
  }
  await supabase.from("posts").delete().eq("id", id); // RLS: own rows only
  revalidatePath("/");
  revalidatePath("/top");
  revalidatePath("/profile");
  redirect("/profile?deleted=1");
}
