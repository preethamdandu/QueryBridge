import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMRequest } from "../schemas/llm-request";

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  }
  return genAI;
}

export async function callGemini(request: LLMRequest): Promise<{
  text: string;
  provider: "gemini";
  model: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      text: `[gemini-dev-stub] ${request.prompt}`,
      provider: "gemini",
      model: "gemini-1.5-pro"
    };
  }

  const model = getClient().getGenerativeModel({ model: "gemini-1.5-pro" });
  const result = await model.generateContent(request.prompt);
  const text = result.response.text();

  return {
    text,
    provider: "gemini",
    model: "gemini-1.5-pro"
  };
}
