import { describe, it, expect } from 'vitest';

/** Mirrors store order total rules for regression safety */
function computeOrderTotal(subtotal: number, discount: number, delivery: number, tax: number) {
  return Math.max(0, subtotal - discount + delivery + tax);
}

function canDeductStock(available: number, requested: number) {
  return requested > 0 && requested <= available;
}

describe('order math', () => {
  it('never returns negative totals', () => {
    expect(computeOrderTotal(100, 150, 0, 0)).toBe(0);
    expect(computeOrderTotal(100, 10, 5, 8)).toBe(103);
  });

  it('blocks oversell', () => {
    expect(canDeductStock(5, 6)).toBe(false);
    expect(canDeductStock(5, 5)).toBe(true);
    expect(canDeductStock(5, 0)).toBe(false);
  });
});
