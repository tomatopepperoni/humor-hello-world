import "server-only";

/**
 * Minimal Google Gemini client (REST, no SDK). Server-side only – the API key
 * never reaches the browser.
 *
 * Env:
 *   GEMINI_API_KEY   required (https://aistudio.google.com/apikey – free tier)
 *   GEMINI_MODEL     optional. One model, or a comma-separated list tried in
 *                    order when a model is overloaded (503/429) or missing (404).
 *                    Defaults to "gemini-3.8-flash,gemini-3.8-flash-lite".
 */

const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.8-flash-lite"];

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
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
      safetySettings: [
        // Roast mode needs a little slack; still blocks anything actually hateful.
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      ],
    }),
    signal: AbortSignal.timeout(40_000),
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
    ?.map((p) => p.text ?? "")
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
 * Sends one prompt (optionally with an image) and returns the model's text plus
 * the model that actually answered. The prompt string passed here is exactly
 * what we persist in the DB.
 *
 * Resilience: each model in GEMINI_MODELS is retried on 429/5xx with a short
 * backoff; a 404 (model retired) or exhausted retries fall through to the next
 * model. Only when every model fails do we surface the last error.
 */
export async function generateText(
  prompt: string,
  image?: GeminiImage
): Promise<{ text: string; model: string }> {
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

  let lastError: GeminiError | undefined;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const text = await callModel(model, key, parts);
        return { text, model };
      } catch (err) {
        const e = err instanceof GeminiError ? err : new GeminiError(String(err));
        lastError = e;
        if (e.status === 404) break; // model gone – try the next one
        if (e.status !== undefined && !RETRY_STATUSES.has(e.status)) throw e; // real error (400/403…)
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  throw new GeminiError(
    `${lastError?.message ?? "Gemini is unavailable."} — Google is under heavy load right now; please try again in a minute.`,
    lastError?.status
  );
}

/** Pull a JSON array of strings out of the model output, tolerating code fences. */
export function parseCaptionList(raw: string, want = 3): string[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fall back to one caption per non-empty line.
    parsed = cleaned
      .split("\n")
      .map((l) => l.replace(/^[\s\-\d.*"]+|["\s]+$/g, "").trim())
      .filter(Boolean);
  }
  let list: string[] = [];
  if (Array.isArray(parsed)) {
    list = parsed.map((x) => (typeof x === "string" ? x : String((x as { caption?: string })?.caption ?? ""))).map((s) => s.trim());
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { captions?: unknown }).captions)) {
    list = ((parsed as { captions: unknown[] }).captions).map((x) => String(x).trim());
  }
  list = list.filter((s) => s.length > 0 && s.length <= 300);
  if (list.length === 0) throw new GeminiError("Could not parse captions from the model output.");
  return list.slice(0, want);
}
