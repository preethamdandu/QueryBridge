import { callGemini } from "./providers/gemini";
import { callOpenAI } from "./providers/openai";
import type { LLMRequest } from "./schemas/llm-request";
import { llmResponseSchema } from "./schemas/llm-response";

type Provider = "openai" | "gemini";

export async function routeLLMRequest(request: LLMRequest) {
  const provider = (process.env.LLM_PROVIDER ?? "openai") as Provider;

  const rawResponse =
    provider === "gemini" ? await callGemini(request) : await callOpenAI(request);

  return llmResponseSchema.parse(rawResponse);
}
