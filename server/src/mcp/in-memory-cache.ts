type CacheEntry = {
  expiresAtMs: number;
  value: Record<string, unknown>;
};

export class InMemoryCacheStore {
  private readonly store = new Map<string, CacheEntry>();

  async get(key: string): Promise<Record<string, unknown> | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAtMs) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: Record<string, unknown>, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAtMs: Date.now() + ttlSeconds * 1000
    });
  }
}
