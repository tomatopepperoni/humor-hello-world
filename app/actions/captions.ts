"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { GEMINI_MODEL, GeminiError, generateText, parseCaptionList } from "@/lib/gemini";
import { VIBES, isVibe, todaysTheme } from "@/lib/vibes";

export type GenerateState = { error?: string };

const CAPTIONS_PER_POST = 3;
const MAX_CONTEXT = 200;

/** Builds the exact prompt we send to Gemini. Stored on every caption row. */
function buildPrompt(opts: {
  vibe: keyof typeof VIBES;
  context: string | null;
  hasImage: boolean;
  theme: string | null;
}) {
  const lines = [
    "You write short social-media captions for college students in New York City.",
    `Audience: a Columbia undergrad who is new to NYC, lives in the dorms, and is online all day.`,
    `Vibe: ${VIBES[opts.vibe].label}. ${VIBES[opts.vibe].instruction}`,
  ];
  if (opts.theme) lines.push(`Today's community theme: "${opts.theme}".`);
  if (opts.hasImage) lines.push("Look carefully at the attached photo and reference specific things in it.");
  if (opts.context) lines.push(`The poster says about this moment: "${opts.context}"`);
  lines.push(
    `Write ${CAPTIONS_PER_POST} different captions. Each under 140 characters, no hashtags, no emojis unless the vibe calls for one, each with a different angle.`,
    `Respond with ONLY a JSON array of ${CAPTIONS_PER_POST} strings.`
  );
  return lines.join("\n");
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
    return { error: "Add a photo or describe the moment (or both)." };
  }
  // Never trust a client-supplied path outside the user's own folder.
  if (imagePath && !imagePath.startsWith(`${user.id}/`)) {
    return { error: "Invalid image path." };
  }

  // 1. Fetch the uploaded image (if any) for the multimodal prompt.
  let image: { mimeType: string; base64: string } | undefined;
  if (imagePath) {
    const { data: blob, error: dlErr } = await supabase.storage.from("photos").download(imagePath);
    if (dlErr || !blob) return { error: `Could not read the uploaded photo: ${dlErr?.message ?? "unknown"}` };
    const buf = Buffer.from(await blob.arrayBuffer());
    image = { mimeType: blob.type || "image/jpeg", base64: buf.toString("base64") };
  }

  // 2. Ask Gemini.
  const prompt = buildPrompt({ vibe, context, hasImage: !!image, theme });
  let captions: string[];
  try {
    const raw = await generateText(prompt, image);
    captions = parseCaptionList(raw, CAPTIONS_PER_POST);
  } catch (err) {
    const msg = err instanceof GeminiError ? err.message : "The caption model is unavailable right now.";
    return { error: msg };
  }

  // 3. Save post + captions (RLS: user_id must equal auth.uid()).
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .insert({ user_id: user.id, image_url: imageUrl, image_path: imagePath, context, vibe, theme })
    .select("id")
    .single();
  if (postErr || !post) return { error: postErr?.message ?? "Could not save the post." };

  const { error: capErr } = await supabase.from("captions").insert(
    captions.map((text, position) => ({
      post_id: post.id,
      user_id: user.id,
      text,
      prompt,
      model: GEMINI_MODEL,
      position,
    }))
  );
  if (capErr) {
    await supabase.from("posts").delete().eq("id", post.id);
    return { error: capErr.message };
  }

  revalidatePath("/");
  revalidatePath("/top");
  redirect(`/p/${post.id}`);
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
  redirect("/");
}
