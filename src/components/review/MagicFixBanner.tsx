import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface Props {
  show: boolean;
  warning: string | null;
  magicFixFailed: boolean;
  magicFixLoading: boolean;
  autoFixed: boolean;
  canTriggerFix: boolean;
  onMagicFix: () => void;
}

export function MagicFixBanner({
  show,
  warning,
  magicFixFailed,
  magicFixLoading,
  autoFixed,
  canTriggerFix,
  onMagicFix,
}: Props) {
  const { t } = useTranslation();

  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-5 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl"
    >
      <div className="flex gap-2 items-start mb-2">
        <span className="text-lg flex-shrink-0">⚠️</span>
        <p className="text-xs text-amber-700 font-medium leading-snug">
          {magicFixFailed
            ? t('review.magicFixFailed')
            : warning}
        </p>
      </div>
      {canTriggerFix && (
        <button
          onClick={onMagicFix}
          disabled={magicFixLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-xl disabled:opacity-60"
        >
          {magicFixLoading ? t('review.magicFixLoading') : t('review.magicFixButton')}
        </button>
      )}
      {autoFixed && (
        <p className="text-xs text-green-600 font-medium mt-1">
          {t('review.autoFixed')}
        </p>
      )}
    </motion.div>
  );
}
