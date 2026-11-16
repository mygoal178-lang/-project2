/**
 * Secure workspace bootstrap via Postgres SECURITY DEFINER RPC.
 */
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export type WorkspaceRpcResult =
  | { success: true; business_id: string; slug: string }
  | { success: false; error: string };

export async function createWorkspaceWithOwnerRpc(payload: {
  name: string;
  slug?: string;
  country?: string;
  currency?: string;
  currency_symbol?: string;
  timezone?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  category?: string;
  owner_name?: string;
}): Promise<WorkspaceRpcResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'supabase_not_configured' };
  }
  try {
    const { data, error } = await supabase.rpc('create_workspace_with_owner', {
      payload: {
        name: payload.name,
        slug: payload.slug || null,
        country: payload.country || 'United States',
        currency: payload.currency || 'USD',
        currency_symbol: payload.currency_symbol || '$',
        timezone: payload.timezone || 'UTC',
        email: payload.email || null,
        phone: payload.phone || '',
        address: payload.address || '',
        city: payload.city || '',
        category: payload.category || 'Retail',
        owner_name: payload.owner_name || null
      }
    });
    if (error) return { success: false, error: error.message };
    const row = data as { success?: boolean; business_id?: string; slug?: string };
    if (!row?.success || !row.business_id) {
      return { success: false, error: 'workspace_rpc_failed' };
    }
    return { success: true, business_id: row.business_id, slug: row.slug || '' };
  } catch (e: any) {
    return { success: false, error: e?.message || 'workspace_rpc_exception' };
  }
}
