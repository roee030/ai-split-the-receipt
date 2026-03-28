import { describe, it, expect } from 'vitest';
import { parseReceiptToItems, checkSubtotalMismatch } from '../receiptParser';
import type { ParsedReceipt } from '../../types/receipt.types';

const baseReceipt: ParsedReceipt = {
  isReceipt: true,
  restaurantName: 'Test',
  subtotal: null,
  tax: null,
  taxPercent: null,
  serviceCharge: null,
  total: null,
  currency: 'ILS',
  confidence: 'high',
  items: [],
};

describe('parseReceiptToItems', () => {
  it('passes through correct math without flagging', () => {
    const items = parseReceiptToItems({
      ...baseReceipt,
      items: [{ id: '1', name: 'Burger', quantity: 2, unitPrice: 45, totalPrice: 90, category: 'food' }],
    });
    expect(items[0].flagged).toBe(false);
    expect(items[0].unitPrice).toBe(45);
  });

  it('flags item when unitPrice x qty does not equal totalPrice', () => {
    const items = parseReceiptToItems({
      ...baseReceipt,
      items: [{ id: '1', name: 'Pizza', quantity: 1, unitPrice: 50, totalPrice: 58, category: 'food' }],
    });
    expect(items[0].flagged).toBe(true);
    expect(items[0].unitPrice).toBe(58); // re-derived from totalPrice
  });

  it('corrects unitPrice from totalPrice when extras rolled in', () => {
    // Burger: unitPrice=45 but extras added so totalPrice=53
    const items = parseReceiptToItems({
      ...baseReceipt,
      items: [{ id: '1', name: 'Burger (extra cheese)', quantity: 1, unitPrice: 45, totalPrice: 53, category: 'food' }],
    });
    expect(items[0].unitPrice).toBe(53);
    expect(items[0].flagged).toBe(true);
  });

  it('does not flag when difference is within rounding tolerance', () => {
    // 3 x 15.33 = 45.99 but totalPrice = 46 (rounding)
    const items = parseReceiptToItems({
      ...baseReceipt,
      items: [{ id: '1', name: 'Beer', quantity: 3, unitPrice: 15.33, totalPrice: 46, category: 'drink' }],
    });
    expect(items[0].flagged).toBe(false);
  });

  it('defaults quantity to 1 when zero', () => {
    const items = parseReceiptToItems({
      ...baseReceipt,
      items: [{ id: '1', name: 'Salad', quantity: 0, unitPrice: 38, totalPrice: 38, category: 'food' }],
    });
    expect(items[0].quantity).toBe(1);
  });

  it('preserves hasExtras flag from raw item', () => {
    const items = parseReceiptToItems({
      ...baseReceipt,
      items: [{ id: '1', name: 'Steak (sauce)', quantity: 1, unitPrice: 89, totalPrice: 89, category: 'food', hasExtras: true }],
    });
    expect(items[0].hasExtras).toBe(true);
  });
});

describe('checkSubtotalMismatch', () => {
  it('returns null when items sum matches subtotal', () => {
    const items = parseReceiptToItems({
      ...baseReceipt,
      items: [
        { id: '1', name: 'A', quantity: 1, unitPrice: 40, totalPrice: 40, category: 'food' },
        { id: '2', name: 'B', quantity: 1, unitPrice: 60, totalPrice: 60, category: 'food' },
      ],
    });
    expect(checkSubtotalMismatch(items, 100)).toBeNull();
  });

  it('returns warning string when subtotal differs by more than 5 percent', () => {
    const items = parseReceiptToItems({
      ...baseReceipt,
      items: [{ id: '1', name: 'X', quantity: 1, unitPrice: 40, totalPrice: 40, category: 'food' }],
    });
    const warning = checkSubtotalMismatch(items, 100);
    expect(warning).not.toBeNull();
    expect(warning).toContain('missing');
  });

  it('returns null when printedSubtotal is null', () => {
    expect(checkSubtotalMismatch([], null)).toBeNull();
  });

  it('returns null when printedSubtotal is zero', () => {
    expect(checkSubtotalMismatch([], 0)).toBeNull();
  });
});
