import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  applyCors,
  assertSafeHttpsUrl,
  requireUser,
  requireBusinessMember,
  rateLimit
} from '../_lib/security';

type Body = {
  business_id?: string;
  channel?: string;
  store_url?: string;
  api_key?: string;
  api_secret?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
    if (!rateLimit(`test:${ip}`, 20, 60_000)) {
      return res.status(429).json({ ok: false, error: 'Rate limit exceeded' });
    }

    // Body size guard
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (raw.length > 32_000) return res.status(413).json({ ok: false, error: 'Payload too large' });

    const { userId, accessToken } = await requireUser(req);
    const body = (typeof req.body === 'object' && req.body ? req.body : {}) as Body;
    if (!body.business_id) return res.status(400).json({ ok: false, error: 'business_id required' });
    if (!body.channel) return res.status(400).json({ ok: false, error: 'channel required' });

    await requireBusinessMember(accessToken, body.business_id);

    if (!body.store_url) return res.status(400).json({ ok: false, error: 'store_url required' });
    // CRITICAL: actually enforce SSRF checks before any outbound call
    const safeUrl = await assertSafeHttpsUrl(
      body.store_url.startsWith('http') ? body.store_url : `https://${body.store_url}`
    );

    const channel = body.channel.toLowerCase();
    if (channel === 'shopify') {
      if (!body.api_key) return res.status(400).json({ ok: false, error: 'api_key required' });
      const host = safeUrl.hostname;
      const endpoint = `https://${host}/admin/api/2024-10/shop.json`;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 12_000);
      try {
        const r = await fetch(endpoint, {
          headers: {
            'X-Shopify-Access-Token': body.api_key,
            Accept: 'application/json'
          },
          signal: controller.signal,
          redirect: 'error'
        });
        if (!r.ok) {
          return res.status(400).json({ ok: false, connected: false, error: `Shopify returned ${r.status}` });
        }
        const data = await r.json();
        return res.status(200).json({
          ok: true,
          connected: true,
          shop_name: data?.shop?.name || null,
          user_id: userId
        });
      } finally {
        clearTimeout(t);
      }
    }

    if (channel === 'woocommerce') {
      if (!body.api_key || !body.api_secret) {
        return res.status(400).json({ ok: false, error: 'api_key and api_secret required' });
      }
      const base = `${safeUrl.origin}/wp-json/wc/v3/system_status`;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 12_000);
      try {
        const auth = Buffer.from(`${body.api_key}:${body.api_secret}`).toString('base64');
        const r = await fetch(base, {
          headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
          signal: controller.signal,
          redirect: 'error'
        });
        if (!r.ok) {
          return res.status(400).json({ ok: false, connected: false, error: `WooCommerce returned ${r.status}` });
        }
        return res.status(200).json({ ok: true, connected: true, user_id: userId });
      } finally {
        clearTimeout(t);
      }
    }

    return res.status(400).json({
      ok: false,
      connected: false,
      error: `Connection test for channel "${channel}" is not fully supported in this build`
    });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Test failed' });
  }
}
