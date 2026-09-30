"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileFormState = { error?: string; success?: string };

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** Save first/last name (and optional bio). Used by /onboarding and /profile. */
export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const first_name = String(formData.get("first_name") ?? "").trim();
  const last_name = String(formData.get("last_name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim() || null;
  const next = String(formData.get("next") ?? "");

  if (!first_name || !last_name) {
    return { error: "First name and last name are both required." };
  }

  // Upsert (not update): if the auth.users trigger didn't create a row for
  // this user, a plain update would silently affect 0 rows.
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        first_name,
        last_name,
        bio,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Profile could not be saved. Please try again." };

  revalidatePath("/", "layout");
  if (next) redirect(next);
  return { success: "Profile saved." };
}

/** Store the public URL of an uploaded avatar (the file itself lives in Storage). */
export async function setAvatarUrl(avatar_url: string): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        avatar_url,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { success: "Photo updated." };
}
