import { z } from "zod";

export const llmResponseSchema = z.object({
  text: z.string().min(1),
  provider: z.enum(["openai", "gemini"]),
  model: z.string().min(1)
});

export type LLMResponse = z.infer<typeof llmResponseSchema>;
