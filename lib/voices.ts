import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VIBE_KEYS, type Vibe } from "@/lib/vibes";

/**
 * Week 7: which voices the picker offers and how often "Surprise me" picks each,
 * set on the admin area's Prompt chain mix page (prompt_chain_mix, read through
 * the security-definer function public.voice_mix()).
 *
 * Falls back to "all voices, equal weight" when the table isn't set up, and
 * never returns an empty picker.
 */
export type VoiceMix = { enabled: Vibe[]; weights: Partial<Record<Vibe, number>> };

const ALL_ON: VoiceMix = {
  enabled: [...VIBE_KEYS],
  weights: Object.fromEntries(VIBE_KEYS.map((k) => [k, 1])) as Partial<Record<Vibe, number>>,
};

export async function getVoiceMix(supabase: Pick<SupabaseClient, "rpc">): Promise<VoiceMix> {
  try {
    const { data, error } = await supabase.rpc("voice_mix");
    if (error || !Array.isArray(data) || data.length === 0) return ALL_ON;
    const rows = data as { slug: string; is_enabled: boolean; weight: number }[];
    const enabled = VIBE_KEYS.filter((k) => rows.some((r) => r.slug === k && r.is_enabled));
    if (enabled.length === 0) return ALL_ON;
    const weights: Partial<Record<Vibe, number>> = {};
    for (const k of enabled) weights[k] = Math.max(0, rows.find((r) => r.slug === k)?.weight ?? 0);
    return { enabled, weights };
  } catch {
    return ALL_ON;
  }
}
