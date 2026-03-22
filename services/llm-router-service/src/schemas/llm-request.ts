import { z } from "zod";

export const llmRequestSchema = z.object({
  prompt: z.string().min(1)
});

export type LLMRequest = z.infer<typeof llmRequestSchema>;
