/**
 * Shared rate limiter for API routes.
 * - Prefer Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set
 * - Falls back to in-memory Map (single-instance only)
 */

type Bucket = { count: number; reset: number };

const memory = new Map<string, Bucket>();

async function redisIncr(key: string, windowMs: number): Promise<{ count: number; reset: number } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redisKey = `rl:${key}`;
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    // INCR then EXPIRE on first hit
    const incrRes = await fetch(`${url}/incr/${encodeURIComponent(redisKey)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!incrRes.ok) return null;
    const incrJson = (await incrRes.json()) as { result?: number };
    const count = Number(incrJson.result) || 1;

    if (count === 1) {
      await fetch(`${url}/expire/${encodeURIComponent(redisKey)}/${windowSec}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    }

    const ttlRes = await fetch(`${url}/ttl/${encodeURIComponent(redisKey)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    let ttl = windowSec;
    if (ttlRes.ok) {
      const ttlJson = (await ttlRes.json()) as { result?: number };
      if (typeof ttlJson.result === 'number' && ttlJson.result > 0) ttl = ttlJson.result;
    }

    return { count, reset: Date.now() + ttl * 1000 };
  } catch {
    return null;
  }
}

function memoryIncr(key: string, windowMs: number): { count: number; reset: number } {
  const now = Date.now();
  const b = memory.get(key);
  if (!b || now > b.reset) {
    const next = { count: 1, reset: now + windowMs };
    memory.set(key, next);
    return next;
  }
  b.count += 1;
  return b;
}

/**
 * Returns true if the request is allowed, false if rate-limited.
 */
export async function checkRateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const redis = await redisIncr(key, windowMs);
  const bucket = redis || memoryIncr(key, windowMs);
  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    reset: bucket.reset
  };
}

/** Sync-compatible wrapper used by existing routes (memory path; Redis when available via void). */
export function rateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = memory.get(key);
  if (!b || now > b.reset) {
    memory.set(key, { count: 1, reset: now + windowMs });
    // fire-and-forget redis for multi-instance alignment
    void redisIncr(key, windowMs);
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  void redisIncr(key, windowMs);
  return true;
}
