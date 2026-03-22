import Redis from "ioredis";

let redis: Redis | null = null;

function getEnvPrefix(): string {
  return process.env.REDIS_ENV_PREFIX ?? "development";
}

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });
  }
  return redis;
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
  await client.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

export class RedisCacheStore {
  private readonly prefix: string;
  private readonly client: Redis;

  constructor(client?: Redis) {
    this.client = client ?? getRedis();
    this.prefix = `QB:${getEnvPrefix()}:`;
  }

  private prefixedKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<Record<string, unknown> | null> {
    const raw = await this.client.get(this.prefixedKey(key));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async set(key: string, value: Record<string, unknown>, ttlSeconds: number): Promise<void> {
    await this.client.set(this.prefixedKey(key), JSON.stringify(value), "EX", ttlSeconds);
  }
}
