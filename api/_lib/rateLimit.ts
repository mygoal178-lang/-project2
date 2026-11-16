/**
 * Shared rate limiter for OrderFlow API routes.
 *
 * Production (NODE_ENV=production / VERCEL_ENV=production):
 *   Requires Upstash Redis (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
 *   Fails closed if Redis is missing or errors.
 *
 * Development:
 *   Uses in-memory Map when Redis is not configured (dev-only fallback).
 */

type Bucket = { count: number; reset: number };

const memory = new Map<string, Bucket>();

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redisIncr(key: string, windowMs: number): Promise<{ count: number; reset: number } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redisKey = `rl:${key}`;
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  try {
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

export async function checkRateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000
): Promise<{ allowed: boolean; remaining: number; reset: number; backend: 'redis' | 'memory' | 'denied' }> {
  if (redisConfigured()) {
    const redis = await redisIncr(key, windowMs);
    if (redis) {
      return {
        allowed: redis.count <= limit,
        remaining: Math.max(0, limit - redis.count),
        reset: redis.reset,
        backend: 'redis'
      };
    }
    if (isProduction()) {
      return { allowed: false, remaining: 0, reset: Date.now() + windowMs, backend: 'denied' };
    }
  } else if (isProduction()) {
    return { allowed: false, remaining: 0, reset: Date.now() + windowMs, backend: 'denied' };
  }

  const bucket = memoryIncr(key, windowMs);
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    reset: bucket.reset,
    backend: 'memory'
  };
}

export function rateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  if (!redisConfigured() && isProduction()) {
    return false;
  }
  if (redisConfigured()) {
    void redisIncr(key, windowMs);
  }
  const bucket = memoryIncr(key, windowMs);
  return bucket.count <= limit;
}

export function clientIpFromRequest(req: { headers?: Record<string, unknown> }): string {
  const h = req.headers || {};
  const vercel = String(h['x-vercel-forwarded-for'] || '').split(',')[0].trim();
  if (vercel) return vercel;
  const real = String(h['x-real-ip'] || '').trim();
  if (real) return real;
  const ff = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  if (ff) return ff;
  return 'unknown';
}

export function applyRateLimitHeaders(
  res: { setHeader: (k: string, v: string | number) => void },
  result: { remaining: number; reset: number; allowed: boolean }
): void {
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.reset / 1000)));
  if (!result.allowed) {
    const retry = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retry));
  }
}
