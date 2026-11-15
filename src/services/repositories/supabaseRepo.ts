/**
 * Supabase-backed repository for OrderFlow production mode.
 * When isSupabaseConfigured is false, callers should use the local store (demo).
 * All queries rely on RLS — never use service role in the browser.
 * Credentials must never be selected or returned to the client.
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

  // ─── Profile ───────────────────────────────────────────────────────────────
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

  // ─── Memberships & Workspaces ──────────────────────────────────────────────
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

  /**
   * Create a new workspace and make the current user the owner.
   * Prefer a SECURITY DEFINER RPC in production for atomicity.
   */
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
  }): Promise<RepoResult<{ business: any; membership: any }>> {
    try {
      const { data: { user } } = await client().auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };

      const { data: business, error: bErr } = await client()
        .from('businesses')
        .insert({
          name: payload.name,
          slug: payload.slug,
          country: payload.country || 'United States',
          currency: payload.currency || 'USD',
          currency_symbol: payload.currency_symbol || '$',
          timezone: payload.timezone || 'UTC',
          email: payload.email || user.email,
          phone: payload.phone || '',
          address: payload.address || '',
          city: payload.city || '',
          subscription_plan: 'free',
          subscription_status: 'active',
          monthly_order_limit: 50
        })
        .select()
        .single();
      if (bErr) return { success: false, error: bErr.message };

      const { data: membership, error: mErr } = await client()
        .from('business_members')
        .insert({
          business_id: business.id,
          user_id: user.id,
          role: 'owner',
          status: 'active'
        })
        .select()
        .single();
      if (mErr) {
        // Best-effort cleanup
        await client().from('businesses').delete().eq('id', business.id);
        return { success: false, error: mErr.message };
      }

      return { success: true, data: { business, membership } };
    } catch (e: any) {
      return { success: false, error: e?.message || 'create_workspace_failed' };
    }
  },

  // ─── Products ──────────────────────────────────────────────────────────────
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
      const { error } = await client()
        .from('products')
        .delete()
        .eq('id', id)
        .eq('business_id', businessId);
      if (error) return { success: false, error: error.message };
      return { success: true, data: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'delete_product_failed' };
    }
  },

  // ─── Customers ─────────────────────────────────────────────────────────────
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

  // ─── Orders ────────────────────────────────────────────────────────────────
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

  /**
   * Create order + items. Stock deduction should be done via a DB function
   * or careful sequential updates with row locks for production concurrency.
   * This method inserts the order and items; caller or RPC should handle stock.
   */
  async createOrder(payload: {
    business_id: string;
    customer_name: string;
    customer_email?: string;
    customer_phone?: string;
    customer_id?: string;
    status?: string;
    payment_status?: string;
    payment_method?: string;
    currency?: string;
    subtotal: number;
    discount?: number;
    delivery_charge?: number;
    tax_amount?: number;
    total_amount: number;
    shipping_address?: any;
    internal_notes?: string;
    external_order_id?: string;
    sales_channel?: string;
    integration_id?: string;
    idempotency_key?: string;
    items: Array<{
      product_id?: string;
      product_title: string;
      sku?: string;
      quantity: number;
      unit_price: number;
      unit_cost?: number;
      total_price: number;
      variant_name?: string;
    }>;
  }): Promise<RepoResult<any>> {
    try {
      if (!payload.business_id || !payload.customer_name) {
        return { success: false, error: 'business_id and customer_name are required' };
      }
      if (!payload.items?.length) {
        return { success: false, error: 'At least one item is required' };
      }
      for (const it of payload.items) {
        const q = Number(it.quantity);
        if (!Number.isInteger(q) || q <= 0) {
          return { success: false, error: 'Quantities must be positive integers' };
        }
      }

      const orderRow: any = {
        business_id: payload.business_id,
        customer_name: payload.customer_name,
        customer_email: payload.customer_email || null,
        customer_phone: payload.customer_phone || null,
        customer_id: payload.customer_id || null,
        status: payload.status || 'pending',
        payment_status: payload.payment_status || 'unpaid',
        payment_method: payload.payment_method || 'cod',
        currency: payload.currency || 'USD',
        subtotal: payload.subtotal,
        discount: payload.discount || 0,
        delivery_charge: payload.delivery_charge || 0,
        tax_amount: payload.tax_amount || 0,
        total_amount: payload.total_amount,
        shipping_address: payload.shipping_address || null,
        internal_notes: payload.internal_notes || null,
        external_order_id: payload.external_order_id || null,
        sales_channel: payload.sales_channel || 'manual',
        integration_id: payload.integration_id || null,
        idempotency_key: payload.idempotency_key || null
      };

      const { data: order, error: oErr } = await client()
        .from('orders')
        .insert(orderRow)
        .select()
        .single();
      if (oErr) return { success: false, error: oErr.message };

      const itemRows = payload.items.map((it) => ({
        order_id: order.id,
        business_id: payload.business_id,
        product_id: it.product_id || null,
        product_title: it.product_title,
        sku: it.sku || null,
        quantity: it.quantity,
        unit_price: it.unit_price,
        unit_cost: it.unit_cost || 0,
        total_price: it.total_price,
        variant_name: it.variant_name || null
      }));

      const { error: iErr } = await client().from('order_items').insert(itemRows);
      if (iErr) {
        // Best-effort cleanup
        await client().from('orders').delete().eq('id', order.id);
        return { success: false, error: iErr.message };
      }

      // Record status history
      await client().from('order_status_history').insert({
        order_id: order.id,
        business_id: payload.business_id,
        status: order.status,
        note: 'Order created',
        created_at: new Date().toISOString()
      });

      return { success: true, data: order };
    } catch (e: any) {
      return { success: false, error: e?.message || 'create_order_failed' };
    }
  },

  async updateOrderStatus(
    orderId: string,
    businessId: string,
    status: string,
    note?: string
  ): Promise<RepoResult<any>> {
    try {
      const { data, error } = await client()
        .from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('business_id', businessId)
        .select()
        .single();
      if (error) return { success: false, error: error.message };

      await client().from('order_status_history').insert({
        order_id: orderId,
        business_id: businessId,
        status,
        note: note || `Status changed to ${status}`,
        created_at: new Date().toISOString()
      });

      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'update_order_status_failed' };
    }
  },

  // ─── Inventory ─────────────────────────────────────────────────────────────
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

      // Read current stock
      const { data: product, error: pErr } = await client()
        .from('products')
        .select('id, stock, title')
        .eq('id', params.product_id)
        .eq('business_id', params.business_id)
        .single();
      if (pErr || !product) return { success: false, error: pErr?.message || 'Product not found' };

      const before = Number(product.stock) || 0;
      const after = before + qty;
      if (after < 0) {
        return { success: false, error: `Insufficient stock. Available: ${before}` };
      }

      const { error: uErr } = await client()
        .from('products')
        .update({ stock: after, updated_at: new Date().toISOString() })
        .eq('id', params.product_id)
        .eq('business_id', params.business_id);
      if (uErr) return { success: false, error: uErr.message };

      const { data: movement, error: mErr } = await client()
        .from('inventory_movements')
        .insert({
          business_id: params.business_id,
          product_id: params.product_id,
          quantity_change: qty,
          stock_before: before,
          stock_after: after,
          reason: params.reason,
          note: params.note || null,
          order_id: params.order_id || null
        })
        .select()
        .single();
      if (mErr) return { success: false, error: mErr.message };

      return { success: true, data: { product: { ...product, stock: after }, movement } };
    } catch (e: any) {
      return { success: false, error: e?.message || 'adjust_stock_failed' };
    }
  },

  // ─── Expenses ──────────────────────────────────────────────────────────────
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
  },

  // ─── Integrations (mask only — never return credentials_encrypted) ─────────
  async listIntegrations(businessId: string): Promise<RepoResult<any[]>> {
    try {
      const { data, error } = await client()
        .from('ecommerce_integrations')
        .select('id, business_id, channel, name, store_url, is_connected, is_verified, credentials_mask, last_sync_at, orders_synced_count, created_at, updated_at')
        .eq('business_id', businessId);
      if (error) return { success: false, error: error.message };
      return { success: true, data: data || [] };
    } catch (e: any) {
      return { success: false, error: e?.message || 'integrations_failed' };
    }
  }
};

export default supabaseRepo;
