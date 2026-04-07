const SYMBOLS: Record<string, string> = {
  ILS: '₪',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export function getCurrencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? currency;
}

/**
 * Formats a monetary amount using the browser's Intl.NumberFormat.
 * - ILS: uses 'he-IL' locale → renders as "120.00 ₪" (symbol after, Israeli standard)
 * - All others: uses default locale with currency style
 *
 * Falls back to a simple `SYMBOL amount` string for unknown currencies
 * or environments without Intl support.
 *
 * Note: `trailingZeroDisplay: 'stripIfInteger'` (ES2023) would render ₪120 instead of ₪120.00.
 * Enable once browser targets confirm support.
 */
export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === 'ILS' ? 'he-IL' : undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback for unknown/invalid currency codes
    const symbol = getCurrencySymbol(currency);
    return `${symbol}${amount.toFixed(2)}`;
  }
}
