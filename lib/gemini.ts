import "server-only";
import { isUsableCaption, tidyCaption } from "@/lib/caption-text";

/**
 * Minimal Google Gemini client (REST, no SDK). Server-side only – the API key
 * never reaches the browser.
 *
 * Env:
 *   GEMINI_API_KEY   required (https://aistudio.google.com/apikey – free tier)
 *   GEMINI_MODEL     optional. One model, or a comma-separated list. Overrides
 *                    DEFAULT_MODELS below when the database has no models set up.
 *
 * Since week 7 the model list normally comes from the llm_models table (see
 * lib/prompt-chain.ts); these defaults are the fallback.
 *
 * Every call to a model is recorded as an `Attempt` (status, latency, tokens,
 * finish reason, raw text, why it was rejected). The caller logs them to
 * generation_requests / llm_responses so the admin area can show what happened.
 */

// 2026-10-06 (free-tier key): 3.6-flash answered in ~3 s, 3.5-flash/lite in 1–3 s,
// 3.7/3.8-flash returned 503 "high demand". The two "-latest" aliases are a last
// resort that follows whatever Flash model Google currently serves; a name that
// doesn't exist just returns 404 and is skipped.
const DEFAULT_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
];

export const GEMINI_MODELS: string[] = (process.env.GEMINI_MODEL || DEFAULT_MODELS.join(","))
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

/** First-choice model (used for display / docs). The actual model is returned per call. */
export const GEMINI_MODEL = GEMINI_MODELS[0];

/** One model to try, with its generation settings (from llm_models). */
export type ModelSpec = { model: string; temperature?: number; maxOutputTokens?: number };

const DEFAULT_TEMPERATURE = 1.0;
// Thinking tokens count toward this limit. 1024 cut week-4 answers off
// mid-JSON (captions like "[" in the feed), so leave plenty of room.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export type GeminiImage = { mimeType: string; base64: string };

export type AttemptOutcome = "ok" | "unusable" | "http_error" | "blocked" | "empty" | "timeout" | "network";

type Usage = {
  prompt_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  total_tokens?: number;
};

/** One model call, as stored in llm_responses. */
export type Attempt = Usage & {
  attempt: number;
  round: number;
  model: string;
  outcome: AttemptOutcome;
  http_status?: number;
  latency_ms: number;
  finish_reason?: string;
  raw_text?: string;
  error?: string;
  at: string;
};

export class GeminiError extends Error {
  /** Every model call made before giving up (filled in by generateText). */
  attempts: Attempt[] = [];
  constructor(
    message: string,
    readonly status?: number,
    readonly outcome?: AttemptOutcome,
    readonly info?: Usage & { finish_reason?: string; raw_text?: string }
  ) {
    super(message);
  }
}

/** Overloaded / rate-limited / flaky: worth trying again or on another model. */
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
/** Pause between full passes over the model list. */
const ROUND_DELAYS_MS = [1500, 4000];
/** Total time budget per request; the page sets maxDuration = 60. */
const BUDGET_MS = 52_000;
const RAW_TEXT_LIMIT = 8000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GeminiJson = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
};

function usageOf(json: GeminiJson): Usage {
  const u = json.usageMetadata;
  if (!u) return {};
  return {
    prompt_tokens: u.promptTokenCount,
    output_tokens: u.candidatesTokenCount,
    thinking_tokens: u.thoughtsTokenCount,
    total_tokens: u.totalTokenCount,
  };
}

/** One generateContent call against one model. Throws GeminiError with the HTTP status. */
async function callModel(
  spec: ModelSpec,
  key: string,
  parts: Part[],
  timeoutMs: number
): Promise<{ text: string; finish_reason?: string } & Usage> {
  const { model } = spec;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: spec.temperature ?? DEFAULT_TEMPERATURE,
        maxOutputTokens: spec.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
      },
      safetySettings: [
        // Roast mode needs a little slack; still blocks anything actually hateful.
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((err: unknown) => {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new GeminiError(
      `${model} ${timedOut ? "timed out" : "could not be reached"}`,
      timedOut ? 504 : 503,
      timedOut ? "timeout" : "network"
    );
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = body;
    try {
      msg = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? body;
    } catch {
      /* keep raw body */
    }
    throw new GeminiError(
      `Gemini ${res.status} (${model}): ${msg.slice(0, 200) || res.statusText}`,
      res.status,
      "http_error"
    );
  }

  const json = (await res.json()) as GeminiJson;
  const usage = usageOf(json);
  const finish_reason = json.candidates?.[0]?.finishReason;

  if (json.promptFeedback?.blockReason) {
    throw new GeminiError(`Prompt blocked (${json.promptFeedback.blockReason}).`, 400, "blocked", {
      ...usage,
      finish_reason: json.promptFeedback.blockReason,
    });
  }
  const text = json.candidates?.[0]?.content?.parts
    ?.filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new GeminiError(`Gemini returned no text (finishReason: ${finish_reason ?? "unknown"}).`, 502, "empty", {
      ...usage,
      finish_reason,
    });
  }
  return { text, finish_reason, ...usage };
}

/**
 * Sends one prompt (optionally with an image) and returns the model's answer,
 * run through `accept`, plus the model that actually answered and every call
 * that was made. The prompt string passed here is exactly what we persist.
 *
 * Resilience: "high demand" 503s are per model, so we go *across* the model
 * list first (one try each) and only then wait and do another pass, up to 3
 * passes inside BUDGET_MS. A model that answers 404 (retired) or 400 (doesn't
 * accept this request) is dropped; an answer that `accept` rejects (fewer than
 * 3 usable captions) counts as a miss for that model. 401/403 (bad key) stop
 * immediately.
 */
export async function generateText<T = string>(
  prompt: string,
  image?: GeminiImage,
  accept: (text: string) => T = (t) => t as unknown as T,
  modelList?: ModelSpec[]
): Promise<{ value: T; model: string; attempts: Attempt[] }> {
  const attempts: Attempt[] = [];
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiError(
      "GEMINI_API_KEY is not set. Add it to .env.local (and Vercel → Environment Variables)."
    );
  }

  const parts: Part[] = [];
  if (image) {
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
  }
  parts.push({ text: prompt });

  const deadline = Date.now() + BUDGET_MS;
  let models: ModelSpec[] =
    modelList && modelList.length > 0 ? [...modelList] : GEMINI_MODELS.map((model) => ({ model }));
  let last: GeminiError | undefined;

  for (let round = 0; round <= ROUND_DELAYS_MS.length && models.length > 0; round++) {
    if (round > 0) {
      const wait = ROUND_DELAYS_MS[round - 1];
      if (Date.now() + wait + 3_000 > deadline) break;
      await sleep(wait);
    }
    for (const spec of [...models]) {
      const left = deadline - Date.now();
      if (left < 3_000) break;
      const startedAt = Date.now();
      const base = { attempt: attempts.length + 1, round: round + 1, model: spec.model, at: new Date(startedAt).toISOString() };
      let answered: Awaited<ReturnType<typeof callModel>> | undefined;
      try {
        answered = await callModel(spec, key, parts, Math.min(25_000, left));
        const value = accept(answered.text);
        const { text, ...meta } = answered;
        attempts.push({
          ...base,
          ...meta,
          outcome: "ok",
          http_status: 200,
          latency_ms: Date.now() - startedAt,
          raw_text: text.slice(0, RAW_TEXT_LIMIT),
        });
        return { value, model: spec.model, attempts };
      } catch (err) {
        const e = err instanceof GeminiError ? err : new GeminiError(String(err));
        if (answered) {
          // The model answered but `accept` rejected the text (e.g. 2 usable captions).
          const { text, ...meta } = answered;
          attempts.push({
            ...base,
            ...meta,
            outcome: "unusable",
            http_status: 200,
            latency_ms: Date.now() - startedAt,
            raw_text: text.slice(0, RAW_TEXT_LIMIT),
            error: e.message.slice(0, 500),
          });
          last = new GeminiError(e.message, 502, "unusable");
          continue;
        }
        attempts.push({
          ...base,
          ...(e.info ?? {}),
          outcome: e.outcome ?? "http_error",
          http_status: e.status,
          latency_ms: Date.now() - startedAt,
          error: e.message.slice(0, 500),
        });
        if (e.status === 401 || e.status === 403) {
          e.attempts = attempts;
          throw e; // key problem: retrying won't help
        }
        if (e.status === 404 || e.status === 400) {
          models = models.filter((m) => m.model !== spec.model);
          if (e.status === 400) last = e;
          continue;
        }
        last = e;
      }
    }
  }

  // "gemini-3.6-flash 503 ×3, gemini-flash-latest 404" – one entry per model.
  const byModel = new Map<string, string[]>();
  for (const a of attempts) {
    const st = a.outcome === "unusable" ? "bad output" : String(a.http_status ?? a.outcome);
    byModel.set(a.model, [...(byModel.get(a.model) ?? []), st]);
  }
  const tried = [...byModel]
    .map(([m, sts]) => (sts.every((x) => x === sts[0]) && sts.length > 1 ? `${m} ${sts[0]} ×${sts.length}` : `${m} ${sts.join("/")}`))
    .join(", ");
  const overloaded = last?.status !== undefined && RETRY_STATUSES.has(last.status);
  const err = new GeminiError(
    overloaded
      ? `Google's Gemini servers are overloaded right now, so no captions were written. Wait a minute and try again. (Tried: ${tried || "no models"})`
      : `${last?.message ?? "Gemini is unavailable."} (Tried: ${tried || "no models"})`,
    last?.status ?? 503
  );
  err.attempts = attempts;
  throw err;
}

/**
 * Pull `want` captions out of the model output. Accepts a JSON array of
 * strings (or {captions: [...]}) and, when the JSON is cut off, salvages every
 * *complete* string literal instead of splitting lines (which is how week-4
 * rows ended up with a caption that was just "["). Throws a retryable
 * GeminiError (502) when fewer than `want` usable captions come back.
 */
export function parseCaptionList(raw: string, want = 3): string[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

  let items: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (Array.isArray(parsed)) items = parsed;
    else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { captions?: unknown }).captions)) {
      items = (parsed as { captions: unknown[] }).captions;
    }
  } catch {
    // Truncated or chatty output: keep only fully closed "…" literals.
    for (const m of cleaned.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      try {
        items.push(JSON.parse(m[0]));
      } catch {
        /* skip malformed literal */
      }
    }
  }

  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of items) {
    const text =
      typeof item === "string"
        ? item
        : item && typeof item === "object" && typeof (item as { caption?: unknown }).caption === "string"
          ? (item as { caption: string }).caption
          : "";
    const t = tidyCaption(text);
    const k = t.toLowerCase();
    if (!isUsableCaption(t) || seen.has(k)) continue;
    seen.add(k);
    list.push(t);
  }

  if (list.length < want) {
    throw new GeminiError(
      `The model returned ${list.length} usable caption${list.length === 1 ? "" : "s"} instead of ${want}.`,
      502,
      "unusable"
    );
  }
  return list.slice(0, want);
}
