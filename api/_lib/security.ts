import type { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import dns from 'dns/promises';
import net from 'net';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function applyCors(req: VercelRequest, res: { setHeader: Function; status: Function; end: Function; json: Function }) {
  const origin = String(req.headers.origin || '');
  if (ALLOWED_ORIGINS.length === 0) {
    // Fail closed in production if not configured — allow same-origin tooling only
    if (process.env.NODE_ENV !== 'production' && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal' || h === '169.254.169.254') return true;
  if (h === '0.0.0.0' || h === '::1' || h === '127.0.0.1') return true;
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
    // IPv4-mapped
    if (lower.startsWith('::ffff:')) {
      return isPrivateIp(lower.replace('::ffff:', ''));
    }
  }
  return false;
}

export async function assertSafeHttpsUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'https:') throw new Error('Only HTTPS URLs are allowed');
  if (u.username || u.password) throw new Error('URLs with credentials are not allowed');
  if (isBlockedHostname(u.hostname)) throw new Error('Host is not allowed');
  if (net.isIP(u.hostname) && isPrivateIp(u.hostname)) throw new Error('Private IP is not allowed');

  // DNS resolution check (best-effort against rebinding to private targets)
  try {
    const records = await dns.lookup(u.hostname, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) throw new Error('Host resolves to a private address');
    }
  } catch (e: any) {
    if (e?.message?.includes('private')) throw e;
    // If DNS fails, reject rather than proxy blindly
    throw new Error('Unable to resolve host safely');
  }
  return u;
}

export async function requireUser(req: VercelRequest): Promise<{ userId: string; accessToken: string }> {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !anon) throw Object.assign(new Error('Server auth not configured'), { status: 500 });

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  return { userId: data.user.id, accessToken: token };
}

export async function requireBusinessMember(
  accessToken: string,
  businessId: string
): Promise<{ role: string }> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await sb
    .from('business_members')
    .select('role, status')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) throw Object.assign(new Error('Forbidden'), { status: 403 });
  return { role: data.role };
}

/** Simple in-memory rate limit (per instance). Prefer edge rate limits in production. */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}
