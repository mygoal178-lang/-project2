/**
 * Secure integration credential vault API.
 * - Requires valid Supabase JWT
 * - Verifies business membership
 * - Encrypts secrets with CREDENTIALS_ENCRYPTION_KEY (server-only)
 * - Never returns decrypted credentials to the client
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  applyCors,
  requireUser,
  requireBusinessMember,
  rateLimit,
  assertSafeHttpsUrl
} from '../_lib/security';
import { encryptCredentials, maskSecret, isVaultConfigured } from '../_lib/credentials';

type Body = {
  business_id?: string;
  channel?: string;
  name?: string;
  store_url?: string;
  api_key?: string;
  api_secret?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  marketplace_id?: string;
  region?: string;
  action?: 'save' | 'disconnect';
};

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw Object.assign(new Error('Server database not configured'), { status: 503 });
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
    if (!rateLimit(`creds:${ip}`, 15, 60_000)) {
      return res.status(429).json({ ok: false, error: 'Rate limit exceeded' });
    }

    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (raw.length > 48_000) return res.status(413).json({ ok: false, error: 'Payload too large' });

    if (!isVaultConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'CREDENTIALS_ENCRYPTION_KEY is not configured on the server'
      });
    }

    const { accessToken } = await requireUser(req);
    const body = (typeof req.body === 'object' && req.body ? req.body : {}) as Body;

    if (!body.business_id) return res.status(400).json({ ok: false, error: 'business_id required' });
    if (!body.channel) return res.status(400).json({ ok: false, error: 'channel required' });

    await requireBusinessMember(accessToken, body.business_id);

    const channel = String(body.channel).toLowerCase();
    if (!['shopify', 'woocommerce', 'amazon'].includes(channel)) {
      return res.status(400).json({
        ok: false,
        error: `Channel "${channel}" credential vault is not enabled (ebay/etsy unfinished)`
      });
    }

    const action = body.action || 'save';
    const db = serviceClient();

    if (action === 'disconnect') {
      const { error } = await db
        .from('ecommerce_integrations')
        .upsert(
          {
            business_id: body.business_id,
            channel,
            name: body.name || channel,
            is_connected: false,
            is_verified: false,
            credentials_encrypted: null,
            credentials_mask: null,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'business_id,channel' }
        );
      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, disconnected: true, channel });
    }

    // Validate store URL when provided
    let storeUrl: string | null = body.store_url || null;
    if (storeUrl) {
      const safe = await assertSafeHttpsUrl(
        storeUrl.startsWith('http') ? storeUrl : `https://${storeUrl}`
      );
      storeUrl = safe.origin;
    }

    const secretBlob = JSON.stringify({
      api_key: body.api_key || null,
      api_secret: body.api_secret || null,
      client_id: body.client_id || null,
      client_secret: body.client_secret || null,
      refresh_token: body.refresh_token || null,
      marketplace_id: body.marketplace_id || null,
      region: body.region || null,
      store_url: storeUrl
    });

    const encrypted = encryptCredentials(secretBlob);
    const mask =
      maskSecret(body.api_key) ||
      maskSecret(body.client_id) ||
      maskSecret(body.refresh_token) ||
      '••••••••';

    const { data, error } = await db
      .from('ecommerce_integrations')
      .upsert(
        {
          business_id: body.business_id,
          channel,
          name: body.name || `${channel} store`,
          store_url: storeUrl,
          is_connected: true,
          is_verified: false,
          credentials_encrypted: encrypted,
          credentials_mask: mask,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'business_id,channel' }
      )
      .select(
        'id, business_id, channel, name, store_url, is_connected, is_verified, credentials_mask, last_sync_at, orders_synced_count'
      )
      .single();

    if (error) return res.status(400).json({ ok: false, error: error.message });

    // Never include credentials_encrypted or plaintext secrets in response
    return res.status(200).json({ ok: true, integration: data });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || 'Credential operation failed' });
  }
}
