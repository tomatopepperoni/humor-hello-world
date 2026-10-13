import "server-only";
import { isUsableCaption, tidyCaption } from "@/lib/caption-text";

/**
 * Minimal Google Gemini client (REST, no SDK). Server-side only – the API key
 * never reaches the browser.
 *
 * Env:
 *   GEMINI_API_KEY   required (https://aistudio.google.com/apikey – free tier)
 *   GEMINI_MODEL     optional. One model, or a comma-separated list. Overrides
 *                    DEFAULT_MODELS below.
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

type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export type GeminiImage = { mimeType: string; base64: string };

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** Overloaded / rate-limited / flaky: worth trying again or on another model. */
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
/** Pause between full passes over the model list. */
const ROUND_DELAYS_MS = [1500, 4000];
/** Total time budget per request; the page sets maxDuration = 60. */
const BUDGET_MS = 52_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One generateContent call against one model. Throws GeminiError with the HTTP status. */
async function callModel(model: string, key: string, parts: Part[], timeoutMs: number): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 1.0,
        // Thinking tokens count toward this limit. 1024 cut week-4 answers off
        // mid-JSON (captions like "[" in the feed), so leave plenty of room.
        maxOutputTokens: 8192,
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
    throw new GeminiError(`${model} ${timedOut ? "timed out" : "could not be reached"}`, timedOut ? 504 : 503);
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = body;
    try {
      msg = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? body;
    } catch {
      /* keep raw body */
    }
    throw new GeminiError(`Gemini ${res.status} (${model}): ${msg.slice(0, 200) || res.statusText}`, res.status);
  }

  const json = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) {
    throw new GeminiError(`Prompt blocked (${json.promptFeedback.blockReason}).`, 400);
  }
  const text = json.candidates?.[0]?.content?.parts
    ?.filter((p) => !(p as { thought?: boolean }).thought)
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new GeminiError(
      `Gemini returned no text (finishReason: ${json.candidates?.[0]?.finishReason ?? "unknown"}).`,
      502
    );
  }
  return text;
}

/**
 * Sends one prompt (optionally with an image) and returns the model's answer,
 * run through `accept`, plus the model that actually answered. The prompt
 * string passed here is exactly what we persist in the DB.
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
  accept: (text: string) => T = (t) => t as unknown as T
): Promise<{ value: T; model: string }> {
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
  let models = [...GEMINI_MODELS];
  const attempts: string[] = [];
  let last: GeminiError | undefined;

  for (let round = 0; round <= ROUND_DELAYS_MS.length && models.length > 0; round++) {
    if (round > 0) {
      const wait = ROUND_DELAYS_MS[round - 1];
      if (Date.now() + wait + 3_000 > deadline) break;
      await sleep(wait);
    }
    for (const model of [...models]) {
      const left = deadline - Date.now();
      if (left < 3_000) break;
      try {
        const text = await callModel(model, key, parts, Math.min(25_000, left));
        return { value: accept(text), model };
      } catch (err) {
        const e = err instanceof GeminiError ? err : new GeminiError(String(err));
        attempts.push(`${model} ${e.status ?? "error"}`);
        if (e.status === 401 || e.status === 403) throw e; // key problem: retrying won't help
        if (e.status === 404 || e.status === 400) {
          models = models.filter((m) => m !== model);
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
    const [m, st] = a.split(" ");
    byModel.set(m, [...(byModel.get(m) ?? []), st]);
  }
  const tried = [...byModel]
    .map(([m, sts]) => (sts.every((x) => x === sts[0]) && sts.length > 1 ? `${m} ${sts[0]} ×${sts.length}` : `${m} ${sts.join("/")}`))
    .join(", ");
  const overloaded = last?.status !== undefined && RETRY_STATUSES.has(last.status);
  throw new GeminiError(
    overloaded
      ? `Google's Gemini servers are overloaded right now, so no captions were written. Wait a minute and try again. (Tried: ${tried})`
      : `${last?.message ?? "Gemini is unavailable."} (Tried: ${tried})`,
    last?.status ?? 503
  );
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
      502
    );
  }
  return list.slice(0, want);
}
