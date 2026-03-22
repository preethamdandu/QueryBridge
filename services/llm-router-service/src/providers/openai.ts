import OpenAI from "openai";
import type { LLMRequest } from "../schemas/llm-request";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export async function callOpenAI(request: LLMRequest): Promise<{
  text: string;
  provider: "openai";
  model: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      text: `[openai-dev-stub] ${request.prompt}`,
      provider: "openai",
      model: "gpt-4"
    };
  }

  const completion = await getClient().chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: request.prompt }],
    max_tokens: 1024
  });

  const text = completion.choices[0]?.message?.content ?? "";
  return {
    text,
    provider: "openai",
    model: completion.model
  };
}
