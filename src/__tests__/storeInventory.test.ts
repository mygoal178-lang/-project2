/**
 * Exercises real OrderFlowStore inventory + order rules (jsdom-free via localStorage mock).
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Minimal localStorage for node
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

describe('OrderFlowStore inventory + orders', () => {
  beforeEach(() => {
    mem.clear();
    // Reset module state by dynamic import would be ideal; store is singleton —
    // we reset via actions.resetToDemoData after import.
  });

  it('rejects oversell and restores stock once on cancel', async () => {
    const { OrderFlowStore } = await import('../services/store');
    OrderFlowStore.resetToDemoData();
    const products = OrderFlowStore.getState().products;
    const p = products[0];
    expect(p).toBeTruthy();
    const start = Number(p.stock);

    const ok = OrderFlowStore.createOrder({
      customerName: 'Test Buyer',
      customerPhone: '+15551234567',
      items: [{ productId: p.id, quantity: 2, unitPrice: p.selling_price }]
    });
    expect(ok.success).toBe(true);
    const after = OrderFlowStore.getState().products.find((x: any) => x.id === p.id);
    expect(Number(after.stock)).toBe(start - 2);

    const orderId = (ok as any).order.id;
    const cancel = OrderFlowStore.updateOrderStatus(orderId, 'cancelled');
    expect(cancel.success).toBe(true);
    const restored = OrderFlowStore.getState().products.find((x: any) => x.id === p.id);
    expect(Number(restored.stock)).toBe(start);

    // Second cancel must not double-restore
    OrderFlowStore.updateOrderStatus(orderId, 'cancelled');
    const again = OrderFlowStore.getState().products.find((x: any) => x.id === p.id);
    expect(Number(again.stock)).toBe(start);
  });

  it('aggregates duplicate line items for stock check', async () => {
    const { OrderFlowStore } = await import('../services/store');
    OrderFlowStore.resetToDemoData();
    const p = OrderFlowStore.getState().products[0];
    // Force small stock
    OrderFlowStore.updateProduct(p.id, { stock: 3 });
    const res = OrderFlowStore.createOrder({
      customerName: 'Agg Test',
      customerPhone: '+15550001111',
      items: [
        { productId: p.id, quantity: 2, unitPrice: 10 },
        { productId: p.id, quantity: 2, unitPrice: 10 }
      ]
    });
    expect(res.success).toBe(false);
  });

  it('rejects invalid status transitions', async () => {
    const { OrderFlowStore } = await import('../services/store');
    OrderFlowStore.resetToDemoData();
    const p = OrderFlowStore.getState().products[0];
    const created = OrderFlowStore.createOrder({
      customerName: 'Status Test',
      customerPhone: '+15550002222',
      items: [{ productId: p.id, quantity: 1, unitPrice: 5 }]
    });
    expect(created.success).toBe(true);
    const id = (created as any).order.id;
    const bad = OrderFlowStore.updateOrderStatus(id, 'delivered');
    expect(bad.success).toBe(false);
  });
});
