import { VIBES, type Vibe } from "@/lib/vibes";

/**
 * The prompt that was hard-coded through week 6. Since week 7 the real prompt
 * is built from prompt_chain_steps (lib/prompt-chain.ts); this is the fallback
 * when the database has no chain for a voice. Same file in both apps,
 * so admin-generated captions are comparable with the rest in the stats.
 * Keep the "Vibe: <label>. …" line: vibeFromPrompt() reads it back.
 */
export function buildPrompt(opts: {
  vibe: Vibe;
  count: number;
  context: string | null;
  hasImage: boolean;
  theme: string | null;
  avoid: string[];
}) {
  const lines = [
    "You write short, funny captions for Captioned NYC, where college students post moments from their week in New York and the captions speak in the voices of the city's subway.",
    "Audience: a Columbia undergrad who is new to NYC, lives in the dorms, rides the 1 train, and is online all day.",
    `Vibe: ${VIBES[opts.vibe].label}. ${VIBES[opts.vibe].instruction}`,
  ];
  if (opts.theme) lines.push(`Today's community theme: "${opts.theme}".`);
  if (opts.hasImage) lines.push("Look carefully at the attached photo and reference specific things in it.");
  if (opts.context) lines.push(`The poster says about this moment: "${opts.context}"`);
  if (opts.avoid.length > 0) {
    lines.push(
      "These captions already exist for this post. Do not repeat their jokes or wording:",
      ...opts.avoid.map((t) => `- ${t}`)
    );
  }
  lines.push(
    `Write ${opts.count} different caption${opts.count === 1 ? "" : "s"}. Each under 140 characters, no hashtags, no emojis, each with a different angle. Every caption must be funny on its own, even to someone who can't see the photo, and must mention a concrete detail of this moment.`,
    `Respond with ONLY a JSON array of ${opts.count} string${opts.count === 1 ? "" : "s"}.`
  );
  return lines.join("\n");
}
