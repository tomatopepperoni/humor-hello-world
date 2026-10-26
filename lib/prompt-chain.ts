import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GEMINI_MODELS, type ModelSpec } from "@/lib/gemini";
import { buildPrompt } from "@/lib/prompt";
import type { Vibe } from "@/lib/vibes";

/**
 * Week 7: the prompt and the model list come from the database, so the admin
 * area can change them without a deploy.
 *
 *   prompt_chains / prompt_chain_steps   the sections of the prompt, per voice
 *   terms                                NYC vocabulary ({{terms}})
 *   generation_examples                  few-shot captions ({{examples}})
 *   llm_models / llm_providers           which models to try, in order
 *
 * Everything arrives in one call to the security-definer function
 * public.generation_config(vibe) (supabase/week7_observability.sql). If that
 * function doesn't exist yet or the voice has no steps, we fall back to the
 * prompt that was hard-coded through week 6, so captions never stop working.
 *
 * Same file in humor-hello-world and humor-admin.
 */

export type ChainStep = { order: number; name: string; condition: string | null; template: string };

export type GenerationConfig = {
  chain: { id: number; slug: string; name: string } | null;
  steps: ChainStep[];
  terms: { term: string; definition: string }[];
  examples: { moment: string; caption: string }[];
  models: { model: string; provider: string; temperature: number | string; max_output_tokens: number }[];
};

export type PromptInputs = {
  vibe: Vibe;
  count: number;
  context: string | null;
  hasImage: boolean;
  theme: string | null;
  avoid: string[];
};

export type PreparedGeneration = {
  prompt: string;
  /** undefined = use the built-in list in lib/gemini.ts */
  models: ModelSpec[] | undefined;
  configSource: "database" | "code";
};

/** Providers the apps can actually call. Models from any other provider are skipped. */
const SUPPORTED_PROVIDERS = new Set(["google"]);

type RpcClient = Pick<SupabaseClient, "rpc">;

export async function loadGenerationConfig(supabase: RpcClient, vibe: string): Promise<GenerationConfig | null> {
  try {
    const { data, error } = await supabase.rpc("generation_config", { p_vibe: vibe });
    if (error || !data || typeof data !== "object") return null;
    const c = data as Partial<GenerationConfig>;
    return {
      chain: c.chain ?? null,
      steps: Array.isArray(c.steps) ? c.steps : [],
      terms: Array.isArray(c.terms) ? c.terms : [],
      examples: Array.isArray(c.examples) ? c.examples : [],
      models: Array.isArray(c.models) ? c.models : [],
    };
  } catch {
    return null;
  }
}

function conditionMet(condition: string | null, p: PromptInputs, cfg: GenerationConfig): boolean {
  switch (condition) {
    case null:
    case "":
      return true;
    case "has_image":
      return p.hasImage;
    case "has_theme":
      return !!p.theme;
    case "has_context":
      return !!p.context;
    case "has_terms":
      return cfg.terms.length > 0;
    case "has_examples":
      return cfg.examples.length > 0;
    case "has_avoid":
      return p.avoid.length > 0;
    default:
      return false; // unknown condition: leave the step out rather than send a broken line
  }
}

/** Joins a chain's steps into the prompt text. Exported so the admin area can preview it. */
export function renderChain(cfg: GenerationConfig, p: PromptInputs): string {
  const vars: Record<string, string> = {
    theme: p.theme ?? "",
    context: p.context ?? "",
    count: String(p.count),
    terms: cfg.terms.map((t) => `- ${t.term}: ${t.definition}`).join("\n"),
    examples: cfg.examples.map((e) => `- (${e.moment}) ${e.caption}`).join("\n"),
    avoid: p.avoid.map((t) => `- ${t}`).join("\n"),
  };
  return [...cfg.steps]
    .sort((a, b) => a.order - b.order)
    .filter((s) => conditionMet(s.condition, p, cfg))
    .map((s) => s.template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? ""))
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

function modelSpecs(cfg: GenerationConfig): ModelSpec[] | undefined {
  const list = cfg.models
    .filter((m) => SUPPORTED_PROVIDERS.has(m.provider) && m.model)
    .map((m) => ({
      model: m.model,
      temperature: Number.isFinite(Number(m.temperature)) ? Number(m.temperature) : undefined,
      maxOutputTokens: Number.isFinite(Number(m.max_output_tokens)) ? Number(m.max_output_tokens) : undefined,
    }));
  return list.length > 0 ? list : undefined;
}

/** The prompt + model list for one caption run. */
export async function prepareGeneration(supabase: RpcClient, p: PromptInputs): Promise<PreparedGeneration> {
  const cfg = await loadGenerationConfig(supabase, p.vibe);
  // The voice line ("Vibe: <label>. …") must be there: vibeFromPrompt() reads it back.
  if (cfg && cfg.steps.length > 0) {
    const prompt = renderChain(cfg, p);
    if (/^Vibe: .+?\. /m.test(prompt)) {
      return { prompt, models: modelSpecs(cfg), configSource: "database" };
    }
  }
  return {
    prompt: buildPrompt(p),
    models: cfg ? modelSpecs(cfg) : undefined,
    configSource: "code",
  };
}

/** For display: the models that will be tried when nothing is configured. */
export const FALLBACK_MODELS = GEMINI_MODELS;
