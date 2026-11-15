/**
 * Cloud bootstrap for OrderFlow.
 * When Supabase is configured, load the signed-in user's memberships and
 * workspace-scoped business data instead of demo/localStorage defaults.
 */
import { isSupabaseConfigured } from '../lib/supabase';
import supabaseRepo from './repositories/supabaseRepo';
import type { UserProfile, Role } from '../types';

export interface CloudBootstrapResult {
  ok: boolean;
  error?: string;
  userRoleForActiveWorkspace?: Role;
  activeBusinessId?: string;
  workspaces?: any[];
  members?: any[];
  products?: any[];
  orders?: any[];
  customers?: any[];
  expenses?: any[];
  integrations?: any[];
}

/**
 * Load memberships and pick an active workspace.
 * Role is taken ONLY from the selected workspace membership — never the max across workspaces.
 */
export async function bootstrapCloudSession(
  preferredBusinessId?: string | null
): Promise<CloudBootstrapResult> {
  if (!isSupabaseConfigured || !supabaseRepo.isAvailable()) {
    return { ok: false, error: 'supabase_not_configured' };
  }

  try {
    const memRes = await supabaseRepo.listMyMemberships();
    if (!memRes.success) {
      return { ok: false, error: memRes.error };
    }

    const memberships = memRes.data || [];
    if (memberships.length === 0) {
      return {
        ok: true,
        workspaces: [],
        members: [],
        products: [],
        orders: [],
        customers: [],
        expenses: [],
        integrations: []
      };
    }

    const workspaces = memberships
      .map((m: any) => {
        const b = m.businesses || m.business || null;
        if (!b) return null;
        return {
          ...b,
          // normalize fields used by UI
          currency_code: b.currency || b.currency_code || 'USD',
          currency_symbol: b.currency_symbol || '$',
          country_code: b.country_code || 'US'
        };
      })
      .filter(Boolean);

    let activeBusinessId =
      preferredBusinessId && workspaces.some((w: any) => w.id === preferredBusinessId)
        ? preferredBusinessId
        : workspaces[0]?.id;

    if (!activeBusinessId) {
      return { ok: true, workspaces, members: memberships, products: [], orders: [], customers: [], expenses: [], integrations: [] };
    }

    const activeMembership = memberships.find(
      (m: any) => m.business_id === activeBusinessId && m.status === 'active'
    );
    const userRoleForActiveWorkspace = (activeMembership?.role || 'staff') as Role;

    const [products, orders, customers, expenses, integrations] = await Promise.all([
      supabaseRepo.listProducts(activeBusinessId),
      supabaseRepo.listOrders(activeBusinessId, 200),
      supabaseRepo.listCustomers(activeBusinessId),
      supabaseRepo.listExpenses(activeBusinessId),
      supabaseRepo.listIntegrations(activeBusinessId)
    ]);

    return {
      ok: true,
      userRoleForActiveWorkspace,
      activeBusinessId,
      workspaces,
      members: memberships,
      products: products.success ? products.data : [],
      orders: orders.success ? orders.data : [],
      customers: customers.success ? customers.data : [],
      expenses: expenses.success ? expenses.data : [],
      integrations: integrations.success ? integrations.data : []
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'bootstrap_failed' };
  }
}

/** Apply bootstrap result onto a partial AppState-like object */
export function applyBootstrapToUser(
  user: UserProfile,
  bootstrap: CloudBootstrapResult
): UserProfile {
  if (!bootstrap.ok || !bootstrap.userRoleForActiveWorkspace) return user;
  return {
    ...user,
    role: bootstrap.userRoleForActiveWorkspace
  };
}
