/**
 * Supabase-backed repository for OrderFlow production mode.
 * When isSupabaseConfigured is false, callers should use the local store (demo).
 * All queries rely on RLS — never use service role in the browser.
 */
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export type RepoResult<T> = { success: true; data: T } | { success: false; error: string };

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}

export const supabaseRepo = {
  isAvailable: () => isSupabaseConfigured && Boolean(supabase),

  async getProfile(userId: string): Promise<RepoResult<any>> {
    try {
      const { data, error } = await client().from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'profile_failed' };
    }
  },

  async upsertProfile(profile: { id: string; email: string; full_name: string; avatar_url?: string }) {
    try {
      const { data, error } = await client()
        .from('profiles')
        .upsert(
          {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url || null,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'id' }
        )
        .select()
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'upsert_profile_failed' };
    }
  },

  /** Memberships for the signed-in user only (RLS). */
  async listMyMemberships(): Promise<RepoResult<any[]>> {
    try {
      const { data, error } = await client()
        .from('business_members')
        .select('id, business_id, role, status, created_at, businesses:business_id(*)')
        .eq('status', 'active');
      if (error) return { success: false, error: error.message };
      return { success: true, data: data || [] };
    } catch (e: any) {
      return { success: false, error: e?.message || 'memberships_failed' };
    }
  },

  async listProducts(businessId: string): Promise<RepoResult<any[]>> {
    try {
      const { data, error } = await client()
        .from('products')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });
      if (error) return { success: false, error: error.message };
      return { success: true, data: data || [] };
    } catch (e: any) {
      return { success: false, error: e?.message || 'products_failed' };
    }
  },

  async listOrders(businessId: string, limit = 100): Promise<RepoResult<any[]>> {
    try {
      const { data, error } = await client()
        .from('orders')
        .select('*, order_items(*)')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return { success: false, error: error.message };
      return { success: true, data: data || [] };
    } catch (e: any) {
      return { success: false, error: e?.message || 'orders_failed' };
    }
  },

  async listCustomers(businessId: string): Promise<RepoResult<any[]>> {
    try {
      const { data, error } = await client()
        .from('customers')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });
      if (error) return { success: false, error: error.message };
      return { success: true, data: data || [] };
    } catch (e: any) {
      return { success: false, error: e?.message || 'customers_failed' };
    }
  },

  async listExpenses(businessId: string): Promise<RepoResult<any[]>> {
    try {
      const { data, error } = await client()
        .from('expenses')
        .select('*')
        .eq('business_id', businessId)
        .order('date', { ascending: false });
      if (error) return { success: false, error: error.message };
      return { success: true, data: data || [] };
    } catch (e: any) {
      return { success: false, error: e?.message || 'expenses_failed' };
    }
  },

  /**
   * Create product — business_id must be authorized via RLS WITH CHECK.
   */
  async createProduct(row: Record<string, unknown>): Promise<RepoResult<any>> {
    try {
      if (!row.business_id || !row.title) {
        return { success: false, error: 'business_id and title are required' };
      }
      const { data, error } = await client().from('products').insert(row).select().single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'create_product_failed' };
    }
  },

  async createCustomer(row: Record<string, unknown>): Promise<RepoResult<any>> {
    try {
      if (!row.business_id || !row.name) {
        return { success: false, error: 'business_id and name are required' };
      }
      const { data, error } = await client().from('customers').insert(row).select().single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'create_customer_failed' };
    }
  },

  async createExpense(row: Record<string, unknown>): Promise<RepoResult<any>> {
    try {
      if (!row.business_id || row.amount === undefined) {
        return { success: false, error: 'business_id and amount are required' };
      }
      const amount = Number(row.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return { success: false, error: 'Invalid amount' };
      }
      const { data, error } = await client().from('expenses').insert(row).select().single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'create_expense_failed' };
    }
  }
};

export default supabaseRepo;
