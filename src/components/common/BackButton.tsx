import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDirection } from '../../hooks/useDirection';
import type { Screen } from '../../types/split.types';

const BACK_LABEL_KEYS: Partial<Record<Screen, string>> = {
  review: 'nav.home',
  people: 'nav.reviewItems',
  claim: 'nav.whosJoining',
  tip: 'nav.claimDishes',
  summary: 'nav.tipAndTax',
  roundrobin: 'nav.summary',
};

interface BackButtonProps {
  screen: Screen;
  className?: string;
}

export function BackButton({ screen, className = '' }: BackButtonProps) {
  const { t } = useTranslation();
  const { isRTL } = useDirection();
  const labelKey = BACK_LABEL_KEYS[screen] ?? 'nav.back';

  return (
    <button
      onClick={() => window.history.back()}
      className={`flex items-center gap-0.5 text-sm font-medium text-muted hover:text-primary transition-colors ${className}`}
    >
      {isRTL
        ? <ChevronRight className="w-4 h-4 flex-shrink-0" />
        : <ChevronLeft  className="w-4 h-4 flex-shrink-0" />
      }
      <span>{t(labelKey)}</span>
    </button>
  );
}
