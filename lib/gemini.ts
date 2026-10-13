import "server-only";
import { isUsableCaption, tidyCaption } from "@/lib/caption-text";

/**
 * Minimal Google Gemini client (REST, no SDK). Server-side only – the API key
 * never reaches the browser.
 *
 * Env:
 *   GEMINI_API_KEY   required (https://aistudio.google.com/apikey – free tier)
 *   GEMINI_MODEL     optional. One model, or a comma-separated list tried in
 *                    order when a model is overloaded (503/429) or missing (404).
 *                    Defaults to gemini-3.6-flash → 3.5-flash → 3.5-flash-lite → 3.8-flash.
 */

// Order = measured on 2026-10-06 with a free-tier key: 3.6-flash answered in ~3 s,
// 3.5-flash/lite in 1–3 s, while 3.7/3.8-flash returned 503 "high demand" every time.
// Any of these can be overridden with GEMINI_MODEL=model1,model2,...
const DEFAULT_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
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

const RETRY_STATUSES = new Set([429, 500, 503, 504]);
const RETRY_DELAYS_MS = [800, 2000, 4000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One generateContent call against one model. Throws GeminiError with the HTTP status. */
async function callModel(model: string, key: string, parts: Part[]): Promise<string> {
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
    signal: AbortSignal.timeout(25_000),
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
 * Resilience: each model in GEMINI_MODELS is retried on 429/5xx with a short
 * backoff; a 404 (model retired) or exhausted retries fall through to the next
 * model. An answer that `accept` rejects (e.g. fewer than 3 usable captions)
 * counts as a retryable failure too. Only when every model fails do we
 * surface the first real error.
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

  // Stay well inside the serverless function time limit.
  const deadline = Date.now() + 50_000;
  let lastError: GeminiError | undefined;
  let firstError: GeminiError | undefined;
  outer: for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (Date.now() > deadline) break outer;
      try {
        const text = await callModel(model, key, parts);
        return { value: accept(text), model };
      } catch (err) {
        const e = err instanceof GeminiError ? err : new GeminiError(String(err));
        lastError = e;
        if (!firstError && e.status !== 404) firstError = e;
        if (e.status === 404) break; // model gone – try the next one
        if (e.status !== undefined && !RETRY_STATUSES.has(e.status)) throw e; // real error (400/403…)
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  const e = firstError ?? lastError;
  throw new GeminiError(
    `${e?.message ?? "Gemini is unavailable."} Tried ${GEMINI_MODELS.join(", ")}. Google is busy right now; try again in a minute.`,
    e?.status
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
