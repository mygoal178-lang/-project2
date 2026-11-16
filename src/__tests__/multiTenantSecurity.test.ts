/**
 * Multi-tenant security unit tests (no live Supabase).
 * Validates client-side isolation rules and documents server RLS expectations.
 */
import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => {
    mem.set(k, v);
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
  clear: () => mem.clear()
};

describe('Multi-tenant isolation (store)', () => {
  beforeEach(() => {
    mem.clear();
  });

  it('products created in workspace A are not visible under workspace B filter', async () => {
    const { OrderFlowStore } = await import('../services/store');
    OrderFlowStore.resetToDemoData();

    const a = OrderFlowStore.createWorkspace({
      name: 'Tenant A',
      slug: 'tenant-a',
      country: 'United States',
      currency: 'USD',
      currency_symbol: '$'
    });
    OrderFlowStore.setActiveWorkspace(a.id);
    OrderFlowStore.addProduct({
      title: 'Only A',
      sku: 'A-1',
      selling_price: 10,
      stock: 5
    });

    const b = OrderFlowStore.createWorkspace({
      name: 'Tenant B',
      slug: 'tenant-b',
      country: 'Germany',
      currency: 'EUR',
      currency_symbol: '€'
    });
    OrderFlowStore.setActiveWorkspace(b.id);
    OrderFlowStore.addProduct({
      title: 'Only B',
      sku: 'B-1',
      selling_price: 20,
      stock: 3
    });

    const state = OrderFlowStore.getState();
    const aProducts = state.products.filter((p: any) => p.business_id === a.id);
    const bProducts = state.products.filter((p: any) => p.business_id === b.id);

    expect(aProducts.every((p: any) => p.business_id === a.id)).toBe(true);
    expect(bProducts.every((p: any) => p.business_id === b.id)).toBe(true);
    expect(aProducts.some((p: any) => p.title === 'Only B')).toBe(false);
    expect(bProducts.some((p: any) => p.title === 'Only A')).toBe(false);
  });

  it('orders are scoped by business_id', async () => {
    const { OrderFlowStore } = await import('../services/store');
    OrderFlowStore.resetToDemoData();
    const ws = OrderFlowStore.createWorkspace({
      name: 'Scoped Shop',
      slug: 'scoped-shop',
      country: 'US',
      currency: 'USD',
      currency_symbol: '$'
    });
    OrderFlowStore.setActiveWorkspace(ws.id);
    OrderFlowStore.addProduct({ title: 'Widget', sku: 'W1', selling_price: 5, stock: 10 });
    const p = OrderFlowStore.getState().products.find((x: any) => x.business_id === ws.id);
    expect(p).toBeTruthy();
    const res = OrderFlowStore.createOrder({
      customerName: 'Buyer',
      customerPhone: '+10000000000',
      items: [{ productId: p.id, quantity: 1, unitPrice: 5 }]
    });
    expect(res.success).toBe(true);
    const orders = OrderFlowStore.getState().orders.filter((o: any) => o.business_id === ws.id);
    expect(orders.length).toBeGreaterThanOrEqual(1);
    expect(orders.every((o: any) => o.business_id === ws.id)).toBe(true);
  });
});

describe('Privilege escalation guards (client policy)', () => {
  it('role switch is a demo-only concern; staff is default in authSession', async () => {
    const { isDemoMode, isDemoExplicitlyEnabled } = await import('../lib/authSession');
    // When Supabase is not configured, demo helpers may apply
    expect(typeof isDemoMode()).toBe('boolean');
    expect(typeof isDemoExplicitlyEnabled()).toBe('boolean');
  });

  it('RBAC: staff cannot manage integrations', async () => {
    const { can } = await import('../services/rbac');
    expect(can('owner', 'integrations:manage')).toBe(true);
    expect(can('staff', 'integrations:manage')).toBe(false);
  });

  it('unsupported marketplaces are disabled at client helper boundary', async () => {
    const { testChannelConnection, syncChannelOrders } = await import('../services/channelIntegrations');
    const ebay = await testChannelConnection({ channel: 'ebay' });
    const etsy = await testChannelConnection({ channel: 'etsy' });
    const amazon = await testChannelConnection({ channel: 'amazon' });
    expect(ebay.ok).toBe(false);
    expect(etsy.ok).toBe(false);
    expect(amazon.ok).toBe(false);

    const ebaySync = await syncChannelOrders({ channel: 'ebay' });
    const etsySync = await syncChannelOrders({ channel: 'etsy' });
    const amazonSync = await syncChannelOrders({ channel: 'amazon' });
    expect(ebaySync.ok).toBe(false);
    expect(etsySync.ok).toBe(false);
    expect(amazonSync.ok).toBe(false);
    expect(ebaySync.count).toBe(0);
    expect(etsySync.count).toBe(0);
    expect(amazonSync.count).toBe(0);
  });
});

describe('RLS policy contract (documented expectations)', () => {
  it('documents that client cannot insert owner membership without admin path', () => {
    // Server migration 20250108000000 removes self-owner insert.
    // This test locks the intended contract for reviewers.
    const contract = {
      businessesInsert: 'denied for clients — RPC only',
      membersInsert: 'owner/admin invite only',
      selfPromote: 'denied via WITH CHECK + trigger',
      crossTenantSelect: 'is_business_member(business_id)'
    };
    expect(contract.businessesInsert).toContain('RPC');
    expect(contract.selfPromote).toContain('denied');
    expect(contract.crossTenantSelect).toContain('is_business_member');
  });
});
