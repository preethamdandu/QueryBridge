type CacheValue = Record<string, unknown>;
type CacheStore = {
  get: (key: string) => Promise<CacheValue | null>;
  set: (key: string, value: CacheValue, ttlSeconds: number) => Promise<void>;
};

export async function withCache(
  cache: CacheStore,
  key: string,
  operation: () => Promise<CacheValue>,
  baseTtlSeconds = 30
): Promise<{ value: CacheValue; cacheHit: boolean }> {
  const cached = await cache.get(key);
  if (cached) {
    return { value: cached, cacheHit: true };
  }

  const value = await operation();
  const ttlWithJitter = baseTtlSeconds + Math.floor(Math.random() * 10);
  await cache.set(key, value, ttlWithJitter);
  return { value, cacheHit: false };
}
