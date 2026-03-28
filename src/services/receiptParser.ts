import type { ParsedReceipt, ReceiptItem } from '../types/receipt.types';
import { generateId } from '../utils/idGenerator';

const ROUNDING_TOLERANCE = 0.11; // ₪0.10 + floating point buffer

export function parseReceiptToItems(parsed: ParsedReceipt): ReceiptItem[] {
  return parsed.items.map((item) => {
    const qty = item.quantity || 1;
    const totalPrice = item.totalPrice ?? 0;
    const unitPrice = item.unitPrice ?? 0;

    // Math invariant: unitPrice × qty should equal totalPrice
    const expected = parseFloat((unitPrice * qty).toFixed(2));
    const actual = parseFloat(totalPrice.toFixed(2));
    const mathBroken = Math.abs(expected - actual) > ROUNDING_TOLERANCE && totalPrice !== 0;

    // totalPrice is ground truth — re-derive unitPrice if math is broken
    const correctedUnitPrice = mathBroken
      ? parseFloat((totalPrice / qty).toFixed(4))
      : unitPrice;

    return {
      id: item.id || generateId(),
      name: item.name,
      quantity: qty,
      unitPrice: correctedUnitPrice,
      totalPrice,
      category: item.category || 'other',
      isEdited: false,
      hasExtras: item.hasExtras ?? false,
      flagged: mathBroken,
    };
  });
}

export function createManualItem(): ReceiptItem {
  return {
    id: generateId(),
    name: '',
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    category: 'food',
    isEdited: true,
    hasExtras: false,
    flagged: false,
  };
}

/**
 * Returns a warning string if the sum of item prices differs significantly
 * from the receipt's printed subtotal. Used by ReviewScreen to show a banner.
 */
export function checkSubtotalMismatch(
  items: ReceiptItem[],
  printedSubtotal: number | null
): string | null {
  if (!printedSubtotal || printedSubtotal <= 0) return null;

  const itemsSum = items.reduce((s, i) => s + i.totalPrice, 0);
  const diff = Math.abs(itemsSum - printedSubtotal);
  const pct = diff / printedSubtotal;

  if (pct > 0.05) {
    return `Items sum (${itemsSum.toFixed(2)}) differs from receipt subtotal (${printedSubtotal.toFixed(2)}) by ${(pct * 100).toFixed(0)}%. Some items may be missing.`;
  }
  return null;
}
