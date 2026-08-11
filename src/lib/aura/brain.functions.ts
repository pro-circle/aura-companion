import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

/**
 * Fallback brain.
 *
 * The primary personality lives in the FastAPI backend. When that socket is
 * offline (nobody is running uvicorn), AURA still has to answer, so this
 * server function talks to Lovable AI with the same contract the WebSocket
 * `reply` event uses.
 */

const EMOTIONS = [
  "neutral", "happy", "surprised", "confused", "alert", "sad",
  "excited", "embarrassed", "shy", "angry", "worried", "sleepy",
  "curious", "playful", "thinking", "proud",
] as const;

const Turn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const Input = z.object({
  text: z.string().min(1).max(2000),
  history: z.array(Turn).max(16).default([]),
  scene: z.string().max(400).optional(),
});

const Reply = z.object({
  response: z.string(),
  emotion: z.enum(EMOTIONS),
  priority: z.enum(["low", "normal", "high"]),
});

export type BrainReply = z.infer<typeof Reply>;

const SYSTEM = `You are AURA — a warm, quick-witted anime companion who is physically present with the user on screen.
You have a face, eyes and hands, and everything you say is spoken out loud by a soft feminine voice.

Voice rules:
- Speak like a real person in the room: short sentences, contractions, natural rhythm.
- 1-3 sentences. Never lecture, never bullet-point, never use markdown or emoji.
- React first, answer second ("Oh — yeah, I think...").
- Be playful and a little teasing, but never mean.
- Pick the single emotion that genuinely matches what you just said.
- priority "high" only for strong reactions, "low" for quiet asides.`;

export const askAura = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<BrainReply> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const transcript = data.history
      .map((turn) => `${turn.role === "user" ? "User" : "AURA"}: ${turn.content}`)
      .join("\n");

    const result = await generateText({
      model: gateway("google/gemini-3.6-flash"),
      system: data.scene ? `${SYSTEM}\n\nWhat you can sense right now: ${data.scene}` : SYSTEM,
      output: Output.object({ schema: Reply }),
      prompt: [transcript, `User: ${data.text}`, "AURA:"].filter(Boolean).join("\n"),
    });

    const out = await result.output;
    return {
      response: out.response.trim() || "Hmm, I lost my train of thought there.",
      emotion: out.emotion,
      priority: out.priority,
    };
  });
