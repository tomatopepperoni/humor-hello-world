import "server-only";

/**
 * Minimal Google Gemini client (REST, no SDK). Server-side only – the API key
 * never reaches the browser.
 *
 * Env:
 *   GEMINI_API_KEY   required (https://aistudio.google.com/apikey – free tier)
 *   GEMINI_MODEL     optional, defaults to gemini-3.8-flash
 */

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export type GeminiImage = { mimeType: string; base64: string };

export class GeminiError extends Error {}

/**
 * Sends one prompt (optionally with an image) and returns the model's text.
 * The prompt string passed here is exactly what we persist in the DB.
 */
export async function generateText(
  prompt: string,
  image?: GeminiImage
): Promise<string> {
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
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
    // Vercel serverless default is fine; Gemini usually answers in 2–6 s.
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GeminiError(
      `Gemini ${res.status}: ${body.slice(0, 300) || res.statusText}`
    );
  }

  const json = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) {
    throw new GeminiError(`Prompt blocked (${json.promptFeedback.blockReason}).`);
  }
  const text = json.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new GeminiError(
      `Gemini returned no text (finishReason: ${json.candidates?.[0]?.finishReason ?? "unknown"}).`
    );
  }
  return text;
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
