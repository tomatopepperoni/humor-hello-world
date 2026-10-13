"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { GeminiError, generateText, parseCaptionList } from "@/lib/gemini";
import { VIBES, isVibe, todaysTheme, type Vibe } from "@/lib/vibes";

/** `busy`: Gemini was overloaded / rate-limited, so trying again shortly should work. */
export type GenerateState = { error?: string; busy?: boolean };

const CAPTIONS_PER_ROUND = 3;
const MAX_CAPTIONS_PER_POST = 9;
const MAX_CONTEXT = 200;

/** Builds the exact prompt we send to Gemini. Stored on every caption row. */
function buildPrompt(opts: {
  vibe: Vibe;
  context: string | null;
  hasImage: boolean;
  theme: string | null;
  avoid?: string[];
}) {
  const lines = [
    "You write short social-media captions for college students in New York City.",
    `Audience: a Columbia undergrad who is new to NYC, lives in the dorms, and is online all day.`,
    // Keep this exact shape ("Vibe: <label>. …"): vibeFromPrompt() reads it back.
    `Vibe: ${VIBES[opts.vibe].label}. ${VIBES[opts.vibe].instruction}`,
  ];
  if (opts.theme) lines.push(`Today's community theme: "${opts.theme}".`);
  if (opts.hasImage) lines.push("Look carefully at the attached photo and reference specific things in it.");
  if (opts.context) lines.push(`The poster says about this moment: "${opts.context}"`);
  if (opts.avoid && opts.avoid.length > 0) {
    lines.push(
      "These captions already exist for this post. Do not repeat their jokes or wording:",
      ...opts.avoid.map((t) => `- ${t}`)
    );
  }
  lines.push(
    `Write ${CAPTIONS_PER_ROUND} different captions. Each under 140 characters, no hashtags, no emojis unless the vibe calls for one, each with a different angle.`,
    `Respond with ONLY a JSON array of ${CAPTIONS_PER_ROUND} strings.`
  );
  return lines.join("\n");
}

async function askGemini(prompt: string, image?: { mimeType: string; base64: string }) {
  try {
    const { value, model } = await generateText(prompt, image, (text) =>
      parseCaptionList(text, CAPTIONS_PER_ROUND)
    );
    return { captions: value, model };
  } catch (err) {
    const msg = err instanceof GeminiError ? err.message : "The caption model is unavailable right now.";
    const status = err instanceof GeminiError ? err.status : undefined;
    const busy = status === undefined || [408, 429, 500, 502, 503, 504].includes(status);
    return { error: msg, busy };
  }
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

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
  const vibe = isVibe(vibeRaw) ? vibeRaw : "chronically-online";
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

  // 1. Fetch the uploaded image (if any) for the multimodal prompt.
  let image: { mimeType: string; base64: string } | undefined;
  if (imagePath) {
    const dl = await downloadImage(supabase, imagePath);
    if ("error" in dl) return { error: dl.error };
    image = dl.image;
  }

  // 2. Ask Gemini (retries + model fallback + output validation live in lib/gemini).
  const prompt = buildPrompt({ vibe, context, hasImage: !!image, theme });
  const ai = await askGemini(prompt, image);
  if ("error" in ai) return { error: ai.error, busy: ai.busy };

  // 3. Save post + captions (RLS: user_id must equal auth.uid()).
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .insert({ user_id: user.id, image_url: imageUrl, image_path: imagePath, context, vibe, theme })
    .select("id")
    .single();
  if (postErr || !post) return { error: postErr?.message ?? "Could not save the post." };

  const { error: capErr } = await supabase.from("captions").insert(
    ai.captions.map((text, position) => ({
      post_id: post.id,
      user_id: user.id,
      text,
      prompt,
      model: ai.model,
      position,
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

export type MoreState = { error?: string; busy?: boolean; added?: number; at?: number };

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
  const vibe: Vibe = isVibe(vibeRaw) ? vibeRaw : "chronically-online";

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

  let image: { mimeType: string; base64: string } | undefined;
  if (post.image_path) {
    const dl = await downloadImage(supabase, post.image_path);
    if ("error" in dl) return { error: dl.error };
    image = dl.image;
  }

  const prompt = buildPrompt({
    vibe,
    context: post.context,
    hasImage: !!image,
    theme: post.theme,
    avoid: existing.map((c) => c.text),
  });
  const ai = await askGemini(prompt, image);
  if ("error" in ai) return { error: ai.error, busy: ai.busy };

  const room = MAX_CAPTIONS_PER_POST - existing.length;
  const start = existing.reduce((max, c) => Math.max(max, c.position), -1) + 1;
  const rows = ai.captions.slice(0, room).map((text, i) => ({
    post_id: post.id,
    user_id: user.id,
    text,
    prompt,
    model: ai.model,
    position: start + i,
  }));
  const { error } = await supabase.from("captions").insert(rows);
  if (error) return { error: error.message };

  revalidatePath(`/p/${post.id}`);
  revalidatePath("/");
  return { added: rows.length, at: Date.now() };
}

export type VoteResult = { error?: string; my_vote?: number };

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

  revalidatePath("/");
  revalidatePath("/top");
  revalidatePath("/profile");
  revalidatePath("/p/[id]", "page");
  return { my_vote };
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
