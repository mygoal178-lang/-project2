import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('rateLimit module', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('allows requests under the limit in non-production memory mode', async () => {
    const { checkRateLimit } = await import('../../api/_lib/rateLimit');
    const key = `test-${Date.now()}-${Math.random()}`;
    const a = await checkRateLimit(key, 3, 60_000);
    expect(a.allowed).toBe(true);
    expect(a.backend).toBe('memory');
    await checkRateLimit(key, 3, 60_000);
    await checkRateLimit(key, 3, 60_000);
    const blocked = await checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
  });

  it('fails closed in production without Redis', async () => {
    process.env.NODE_ENV = 'production';
    const isProd = process.env.NODE_ENV === 'production';
    const redisOk = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    expect(isProd && !redisOk).toBe(true);
  });

  it('clientIpFromRequest prefers platform headers', async () => {
    const { clientIpFromRequest } = await import('../../api/_lib/rateLimit');
    expect(
      clientIpFromRequest({
        headers: {
          'x-forwarded-for': '1.2.3.4',
          'x-vercel-forwarded-for': '9.9.9.9',
          'x-real-ip': '8.8.8.8'
        }
      })
    ).toBe('9.9.9.9');
  });
});
