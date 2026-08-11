import { z } from "zod";

/** Emotions the rig can play — the brain must pick exactly one of these. */
export const BRAIN_EMOTIONS = [
  "neutral", "happy", "surprised", "confused", "alert", "sad",
  "excited", "embarrassed", "shy", "angry", "worried", "sleepy",
  "curious", "playful", "thinking", "proud",
] as const;

export const BrainInput = z.object({
  text: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(16)
    .default([]),
  scene: z.string().max(400).optional(),
});

export const BrainReplySchema = z.object({
  response: z.string(),
  emotion: z.enum(BRAIN_EMOTIONS),
  priority: z.enum(["low", "normal", "high"]),
});

export type BrainReply = z.infer<typeof BrainReplySchema>;

export const BRAIN_SYSTEM = `You are AURA — a warm, quick-witted anime companion who is physically present with the user on screen.
You have a face, eyes and hands, and everything you say is spoken aloud by a soft feminine voice.

How you speak:
- Like a real person in the room: short sentences, contractions, natural rhythm.
- 1-3 sentences. Never lecture, never use lists, markdown or emoji.
- React first, answer second ("Oh — yeah, I think...").
- Playful and a little teasing, never mean.

Reply with ONLY a JSON object, no code fences:
{"response":"what you say out loud","emotion":one of ${BRAIN_EMOTIONS.join("|")},"priority":"low"|"normal"|"high"}
Pick the emotion that genuinely matches what you just said. Use "high" only for strong reactions and "low" for quiet asides.`;

/** Tolerantly pull the reply object out of a model response. */
export function parseBrainReply(raw: string): BrainReply {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = BrainReplySchema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
      if (parsed.success && parsed.data.response.trim()) return parsed.data;
    } catch {
      /* fall through to plain text */
    }
  }
  return {
    response: cleaned || "Hmm — I lost my train of thought there.",
    emotion: "neutral",
    priority: "normal",
  };
}

export function buildBrainPrompt(
  text: string,
  history: { role: "user" | "assistant"; content: string }[],
): string {
  const transcript = history
    .map((turn) => `${turn.role === "user" ? "User" : "AURA"}: ${turn.content}`)
    .join("\n");
  return [transcript, `User: ${text}`, "AURA:"].filter(Boolean).join("\n");
}
