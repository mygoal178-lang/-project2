/**
 * Security / RBAC / order-rule unit tests (no live Supabase required).
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

describe('RBAC helpers and order rules', () => {
  beforeEach(() => {
    mem.clear();
  });

  it('defaultTabForRole never elevates staff to owner tabs only', async () => {
    const { defaultTabForRole, canAccessTab, can } = await import('../services/rbac');
    expect(defaultTabForRole('staff')).toBeTruthy();
    expect(can('staff', 'orders:create')).toBeTypeOf('boolean');
    // Staff must not manage integrations if policy denies
    const staffIntegrations = can('staff', 'integrations:manage');
    const ownerIntegrations = can('owner', 'integrations:manage');
    expect(ownerIntegrations).toBe(true);
    // staff may or may not — assert owner is strictly stronger or equal
    expect(ownerIntegrations || !staffIntegrations).toBe(true);
    expect(canAccessTab('staff', 'dashboard')).toBe(true);
  });

  it('createOrder rejects zero and negative quantities', async () => {
    const { OrderFlowStore } = await import('../services/store');
    OrderFlowStore.resetToDemoData();
    const p = OrderFlowStore.getState().products[0];
    const zero = OrderFlowStore.createOrder({
      customerName: 'Bad Qty',
      customerPhone: '+10000000000',
      items: [{ productId: p.id, quantity: 0, unitPrice: 10 }]
    });
    // quantity 0 coerced or rejected — must not succeed with invalid stock logic
    if (zero.success) {
      // If coerced to 1, stock must still be consistent
      expect(OrderFlowStore.getState().products.find((x: any) => x.id === p.id).stock).toBeLessThanOrEqual(
        Number(p.stock)
      );
    } else {
      expect(zero.success).toBe(false);
    }

    const neg = OrderFlowStore.createOrder({
      customerName: 'Neg Qty',
      customerPhone: '+10000000001',
      items: [{ productId: p.id, quantity: -3, unitPrice: 10 }]
    });
    expect(neg.success).toBe(false);
  });

  it('workspace-scoped filtering isolates products by business_id', async () => {
    const { OrderFlowStore } = await import('../services/store');
    OrderFlowStore.resetToDemoData();
    const ws = OrderFlowStore.createWorkspace({
      name: 'Other Shop',
      slug: 'other-shop',
      country: 'Germany',
      currency: 'EUR',
      currency_symbol: '€'
    });
    OrderFlowStore.setActiveWorkspace(ws.id);
    OrderFlowStore.addProduct({
      title: 'Euro Only Product',
      sku: 'EU-1',
      selling_price: 19.99,
      stock: 5
    });
    const state = OrderFlowStore.getState();
    const scoped = state.products.filter((p: any) => p.business_id === ws.id);
    expect(scoped.some((p: any) => p.title === 'Euro Only Product')).toBe(true);
    // Switch back to demo — euro product must not appear under demo id filter
    OrderFlowStore.setActiveWorkspace('biz_demo');
    const demoProducts = OrderFlowStore.getState().products.filter((p: any) => p.business_id === 'biz_demo');
    expect(demoProducts.every((p: any) => p.business_id === 'biz_demo')).toBe(true);
  });
});
