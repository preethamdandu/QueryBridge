import type { LLMRequest } from "../schemas/llm-request";

export async function callGemini(request: LLMRequest): Promise<{
  text: string;
  provider: "gemini";
  model: string;
}> {
  // Placeholder only. Real Gemini client wiring belongs here.
  return {
    text: `gemini placeholder response for: ${request.prompt}`,
    provider: "gemini",
    model: "gemini-1.5-pro"
  };
}
