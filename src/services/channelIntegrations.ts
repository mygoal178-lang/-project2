/**
 * Client helpers for production channel integrations.
 * Calls Vercel serverless routes under /api/integrations/*
 * Credentials are sent only to your own backend — never log them.
 *
 * Production: secrets are stored via /api/integrations/credentials (AES-256-GCM).
 * Demo mode only: optional ephemeral sessionStorage (cleared on tab close).
 */
import { isSupabaseConfigured } from '../lib/supabase';
import { supabase } from '../lib/supabase';

export type IntegrationChannel = 'shopify' | 'woocommerce' | 'amazon' | 'ebay' | 'etsy';

export interface ChannelCredentials {
  channel: IntegrationChannel;
  store_url?: string;
  api_key?: string;
  api_secret?: string;
  /** Amazon LWA */
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  marketplace_id?: string;
  region?: 'na' | 'eu' | 'fe';
  business_id?: string;
  name?: string;
}

export interface NormalizedChannelOrder {
  external_id: string;
  order_number: string;
  channel: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  status: string;
  payment_status: string;
  currency: string;
  subtotal: number;
  total_amount: number;
  shipping_address: {
    address_line1?: string;
    city?: string;
    state_province_region?: string;
    postal_zip_code?: string;
    country?: string;
    country_code?: string;
  };
  items: Array<{
    product_title: string;
    sku?: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  created_at: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message?: string;
  error?: string;
  connected?: boolean;
  meta?: Record<string, unknown>;
  status?: number;
}

export interface SyncOrdersResult {
  ok: boolean;
  count: number;
  orders: NormalizedChannelOrder[];
  message?: string;
  note?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function testChannelConnection(
  creds: ChannelCredentials & { business_id?: string }
): Promise<TestConnectionResult> {
  if (creds.channel === 'ebay' || creds.channel === 'etsy') {
    return {
      ok: false,
      connected: false,
      message: `${creds.channel} production connector is not enabled yet. Use Shopify or WooCommerce.`
    };
  }
  if (creds.channel === 'amazon') {
    return {
      ok: false,
      connected: false,
      message:
        'Amazon SP-API order retrieval is only partially supported. Full SigV4 order sync is not complete in this build.'
    };
  }
  return postJson<TestConnectionResult>('/api/integrations/test', {
    ...creds,
    business_id: creds.business_id
  });
}

export async function syncChannelOrders(
  creds: ChannelCredentials & { business_id?: string; created_after?: string; limit?: number }
): Promise<SyncOrdersResult> {
  if (creds.channel === 'ebay' || creds.channel === 'etsy') {
    return {
      ok: false,
      count: 0,
      orders: [],
      message: `${creds.channel} production sync is not enabled yet.`
    };
  }
  if (creds.channel === 'amazon') {
    return {
      ok: false,
      count: 0,
      orders: [],
      message: 'Amazon SP-API full order sync is not complete in this build.'
    };
  }
  return postJson<SyncOrdersResult>('/api/integrations/sync', creds);
}

/**
 * Save credentials to the server-side encrypted vault.
 * Does NOT store secrets in localStorage when Supabase is configured.
 */
export async function saveChannelCredentialsSecure(
  creds: ChannelCredentials & { business_id: string }
): Promise<{ ok: boolean; integration?: any; error?: string }> {
  if (!isSupabaseConfigured) {
    // Demo only: ephemeral sessionStorage (tab-scoped), never localStorage
    try {
      sessionStorage.setItem(
        `orderflow_demo_creds_${creds.channel}`,
        JSON.stringify({
          channel: creds.channel,
          store_url: creds.store_url
          // intentionally omit secrets even in demo session storage when possible
        })
      );
    } catch {
      /* ignore */
    }
    return { ok: true };
  }

  try {
    const result = await postJson<{ ok: boolean; integration?: any; error?: string }>(
      '/api/integrations/credentials',
      { ...creds, action: 'save' }
    );
    return result;
  } catch (e: any) {
    return { ok: false, error: e?.message || 'save_failed' };
  }
}

export async function disconnectChannelCredentials(
  businessId: string,
  channel: IntegrationChannel
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    try {
      sessionStorage.removeItem(`orderflow_demo_creds_${channel}`);
    } catch {
      /* ignore */
    }
    return { ok: true };
  }
  try {
    return await postJson('/api/integrations/credentials', {
      business_id: businessId,
      channel,
      action: 'disconnect'
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'disconnect_failed' };
  }
}

/** @deprecated Do not store secrets in localStorage. Kept as no-op clearer. */
export function saveChannelCredentials(_integrationId: string, _creds: ChannelCredentials): void {
  if (typeof console !== 'undefined') {
    console.warn(
      '[OrderFlow] saveChannelCredentials(localStorage) is disabled. Use saveChannelCredentialsSecure().'
    );
  }
}

export function loadChannelCredentials(_integrationId: string): ChannelCredentials | null {
  // Secrets are never readable from the client in production.
  return null;
}

export function clearChannelCredentials(integrationId: string): void {
  try {
    // Clean any legacy localStorage keys from older builds
    const CREDS_KEY = 'orderflow_channel_creds_v1';
    const raw = localStorage.getItem(CREDS_KEY);
    if (raw) {
      const all = JSON.parse(raw);
      delete all[integrationId];
      localStorage.setItem(CREDS_KEY, JSON.stringify(all));
    }
  } catch {
    /* ignore */
  }
}

/** One-time purge of legacy plaintext credential localStorage */
export function purgeLegacyCredentialStorage(): void {
  try {
    localStorage.removeItem('orderflow_channel_creds_v1');
  } catch {
    /* ignore */
  }
}
