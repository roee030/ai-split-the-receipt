import { formatCurrency } from '../../utils/currency';

interface CurrencyDisplayProps {
  amount: number;
  currency: string;
  className?: string;
  showWarningForZero?: boolean;
}

export function CurrencyDisplay({ amount, currency, className = '', showWarningForZero = false }: CurrencyDisplayProps) {
  if (showWarningForZero && amount === 0) {
    return <span className={className}>⚠️</span>;
  }
  return <span className={className}>{formatCurrency(amount, currency)}</span>;
}
