function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetries<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        break;
      }
      const delayMs = Math.pow(2, attempt) * 100 + Math.floor(Math.random() * 75);
      await sleep(delayMs);
      attempt += 1;
    }
  }

  throw lastError ?? new Error("Unknown retry failure");
}
