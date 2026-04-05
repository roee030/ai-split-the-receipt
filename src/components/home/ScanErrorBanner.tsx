import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface Props {
  error: string | null;
  onDismiss: () => void;
}

export function ScanErrorBanner({ error, onDismiss }: Props) {
  const { t } = useTranslation();

  function getErrorTitle(msg: string): string {
    if (msg.includes('wait a moment')) return t('home.errorTitles.rateLimit');
    if (msg.includes('identify a receipt')) return t('home.errorTitles.notAReceipt');
    if (msg.includes('find any items')) return t('home.errorTitles.nothingDetected');
    if (
      msg.includes('blurry') ||
      msg.includes('dark') ||
      msg.includes('cut off') ||
      msg.includes('covering')
    ) return t('home.errorTitles.photoIssue');
    return t('home.errorTitles.scanFailed');
  }

  return (
    <div role="alert" aria-live="polite">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-5 mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700"
          >
            <p className="font-semibold mb-0.5">{getErrorTitle(error)}</p>
            <p className="text-red-600 text-xs">{error}</p>
            <button
              onClick={onDismiss}
              className="mt-2 text-xs text-red-500 font-medium underline underline-offset-2"
            >
              {t('home.dismiss')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
