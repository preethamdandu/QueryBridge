import type { LLMRequest } from "../schemas/llm-request";

export async function callOpenAI(request: LLMRequest): Promise<{
  text: string;
  provider: "openai";
  model: string;
}> {
  // Placeholder only. Real OpenAI client wiring belongs here.
  return {
    text: `openai placeholder response for: ${request.prompt}`,
    provider: "openai",
    model: "gpt-4"
  };
}
