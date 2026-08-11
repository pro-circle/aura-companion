import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import {
  BRAIN_SYSTEM,
  BrainInput,
  buildBrainPrompt,
  parseBrainReply,
  type BrainReply,
} from "./brain.shared";

/**
 * Fallback brain: AURA's personality when the FastAPI backend isn't running.
 * Same reply contract as the WebSocket `reply` event, so she sounds identical.
 */
export const askAura = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => BrainInput.parse(data))
  .handler(async ({ data }): Promise<BrainReply> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const result = await generateText({
      model: gateway("google/gemini-3.6-flash"),
      system: data.scene ? `${BRAIN_SYSTEM}\n\nWhat you sense right now: ${data.scene}` : BRAIN_SYSTEM,
      prompt: buildBrainPrompt(data.text, data.history),
    });

    return parseBrainReply(result.text);
  });
