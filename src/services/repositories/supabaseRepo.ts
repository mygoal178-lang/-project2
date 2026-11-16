/**
 * Supabase-backed repository for OrderFlow production mode.
 * Workspace creation uses create_workspace_with_owner RPC only.
 * Order creation uses create_order_with_stock RPC.
 * Stock adjust uses adjust_product_stock RPC.
 */
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { createWorkspaceWithOwnerRpc } from './workspaceRpc';

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

  async createWorkspace(payload: {
    name: string;
    slug: string;
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
  }): Promise<RepoResult<{ business: any; membership: any }>> {
    try {
      const rpc = await createWorkspaceWithOwnerRpc({
        name: payload.name,
        slug: payload.slug,
        country: payload.country,
        currency: payload.currency,
        currency_symbol: payload.currency_symbol,
        timezone: payload.timezone,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        city: payload.city,
        category: payload.category,
        owner_name: payload.owner_name
      });
      if (!rpc.success) return { success: false, error: rpc.error };

      const { data: business, error: bErr } = await client()
        .from('businesses')
        .select('*')
        .eq('id', rpc.business_id)
        .single();
      if (bErr || !business) {
        return {
          success: true,
          data: {
            business: { id: rpc.business_id, slug: rpc.slug, name: payload.name },
            membership: { business_id: rpc.business_id, role: 'owner', status: 'active' }
          }
        };
      }

      const { data: membership } = await client()
        .from('business_members')
        .select('*')
        .eq('business_id', rpc.business_id)
        .eq('status', 'active')
        .maybeSingle();

      return {
        success: true,
        data: {
          business,
          membership: membership || { business_id: rpc.business_id, role: 'owner', status: 'active' }
        }
      };
    } catch (e: any) {
      return { success: false, error: e?.message || 'create_workspace_failed' };
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

  async updateProduct(id: string, businessId: string, updates: Record<string, unknown>): Promise<RepoResult<any>> {
    try {
      const { data, error } = await client()
        .from('products')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('business_id', businessId)
        .select()
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'update_product_failed' };
    }
  },

  async deleteProduct(id: string, businessId: string): Promise<RepoResult<boolean>> {
    try {
      const { error } = await client().from('products').delete().eq('id', id).eq('business_id', businessId);
      if (error) return { success: false, error: error.message };
      return { success: true, data: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'delete_product_failed' };
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

  async createOrder(payload: any): Promise<RepoResult<{ order_id: string; order_number?: string; idempotent?: boolean }>> {
    try {
      if (!payload.business_id || !payload.customer_name) {
        return { success: false, error: 'business_id and customer_name are required' };
      }
      if (!payload.items?.length) return { success: false, error: 'At least one item is required' };

      const shippingAddress =
        typeof payload.shipping_address === 'string'
          ? payload.shipping_address
          : payload.shipping_address
            ? JSON.stringify(payload.shipping_address)
            : '';

      const rpcPayload = {
        business_id: payload.business_id,
        customer_name: payload.customer_name,
        customer_email: payload.customer_email || null,
        customer_phone: payload.customer_phone || '',
        customer_id: payload.customer_id || null,
        shipping_address: shippingAddress,
        shipping_city: payload.shipping_city || 'Unknown',
        shipping_country_code: payload.shipping_country_code || 'US',
        shipping_address_json:
          payload.shipping_address_json ||
          (typeof payload.shipping_address === 'object' ? payload.shipping_address : {}),
        payment_status: payload.payment_status || 'unpaid',
        payment_method: payload.payment_method || 'cod',
        currency_code: payload.currency || 'USD',
        currency_symbol: payload.currency_symbol || '$',
        subtotal: payload.subtotal,
        discount: payload.discount || 0,
        delivery_charge: payload.delivery_charge || 0,
        tax_amount: payload.tax_amount || 0,
        total_amount: payload.total_amount,
        total_cost: payload.total_cost || 0,
        internal_notes: payload.internal_notes || null,
        sales_channel: payload.sales_channel || 'manual',
        external_order_id: payload.external_order_id || null,
        integration_id: payload.integration_id || null,
        idempotency_key: payload.idempotency_key || crypto.randomUUID(),
        items: (payload.items || []).map((it: any) => ({
          product_id: it.product_id || null,
          product_title: it.product_title,
          sku: it.sku || '',
          quantity: it.quantity,
          unit_price: it.unit_price,
          unit_cost: it.unit_cost || 0,
          total_price: it.total_price,
          variant_name: it.variant_name || null
        }))
      };

      const { data, error } = await client().rpc('create_order_with_stock', { payload: rpcPayload });
      if (error) return { success: false, error: error.message };
      const result = data as { success?: boolean; order_id?: string; order_number?: string; idempotent?: boolean };
      if (!result?.success || !result.order_id) {
        return { success: false, error: 'Order RPC returned unsuccessful result' };
      }
      return {
        success: true,
        data: { order_id: result.order_id, order_number: result.order_number, idempotent: Boolean(result.idempotent) }
      };
    } catch (e: any) {
      return { success: false, error: e?.message || 'create_order_failed' };
    }
  },

  async updateOrderStatus(orderId: string, businessId: string, status: string, note?: string): Promise<RepoResult<any>> {
    try {
      const { data, error } = await client()
        .from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('business_id', businessId)
        .select()
        .single();
      if (error) return { success: false, error: error.message };

      const hist = await client().from('order_status_history').insert({
        order_id: orderId,
        status,
        note: note || `Status changed to ${status}`,
        created_at: new Date().toISOString()
      });
      if (hist.error) return { success: false, error: hist.error.message };

      if (status === 'cancelled' || status === 'returned') {
        const reason = status === 'returned' ? 'return_restore' : 'cancellation_restore';
        const rest = await this.restoreOrderStock(orderId, reason);
        if (!rest.success) return { success: false, error: rest.error };
      }

      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'update_order_status_failed' };
    }
  },

  async restoreOrderStock(
    orderId: string,
    reason: 'cancellation_restore' | 'return_restore' = 'cancellation_restore'
  ): Promise<RepoResult<{ already_restored: boolean; restored_lines: number }>> {
    try {
      const { data, error } = await client().rpc('restore_order_stock', {
        p_order_id: orderId,
        p_reason: reason
      });
      if (error) return { success: false, error: error.message };
      const result = data as { success?: boolean; already_restored?: boolean; restored_lines?: number };
      if (!result?.success) return { success: false, error: 'restore_order_stock RPC failed' };
      return {
        success: true,
        data: {
          already_restored: Boolean(result.already_restored),
          restored_lines: Number(result.restored_lines) || 0
        }
      };
    } catch (e: any) {
      return { success: false, error: e?.message || 'restore_order_stock_failed' };
    }
  },

  async adjustStock(params: {
    business_id: string;
    product_id: string;
    quantity_change: number;
    reason: string;
    note?: string;
    order_id?: string;
  }): Promise<RepoResult<any>> {
    try {
      const qty = Number(params.quantity_change);
      if (!Number.isFinite(qty) || qty === 0) {
        return { success: false, error: 'quantity_change must be a non-zero number' };
      }
      const { data, error } = await client().rpc('adjust_product_stock', {
        payload: {
          business_id: params.business_id,
          product_id: params.product_id,
          quantity_change: qty,
          reason: params.reason || 'manual_adjustment',
          note: params.note || null
        }
      });
      if (error) return { success: false, error: error.message };
      const result = data as { success?: boolean; stock_after?: number; stock_before?: number };
      if (!result?.success) return { success: false, error: 'adjust_product_stock RPC failed' };
      return {
        success: true,
        data: {
          product: { id: params.product_id, stock: result.stock_after },
          stock_before: result.stock_before,
          stock_after: result.stock_after
        }
      };
    } catch (e: any) {
      return { success: false, error: e?.message || 'adjust_stock_failed' };
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

  async createExpense(row: Record<string, unknown>): Promise<RepoResult<any>> {
    try {
      if (!row.business_id || row.amount === undefined) {
        return { success: false, error: 'business_id and amount are required' };
      }
      const { data, error } = await client().from('expenses').insert(row).select().single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'create_expense_failed' };
    }
  },

  async listIntegrations(businessId: string): Promise<RepoResult<any[]>> {
    try {
      const { data, error } = await client()
        .from('ecommerce_integrations')
        .select('id, business_id, channel, name, is_connected, store_url, last_sync_at, orders_synced_count, auto_sync')
        .eq('business_id', businessId);
      if (error) return { success: false, error: error.message };
      return { success: true, data: data || [] };
    } catch (e: any) {
      return { success: false, error: e?.message || 'integrations_failed' };
    }
  }
};

export default supabaseRepo;
