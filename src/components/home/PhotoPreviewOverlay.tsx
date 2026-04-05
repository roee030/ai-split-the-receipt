import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  visible: boolean;
  previewUrl: string | null;
  onRetake: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function PhotoPreviewOverlay({ visible, previewUrl, onRetake, onConfirm, onDismiss }: Props) {
  const { t } = useTranslation();

  const checklist = [
    { icon: '💡', label: t('home.previewChecklist.lit') },
    { icon: '📃', label: t('home.previewChecklist.fullVisible') },
    { icon: '🔍', label: t('home.previewChecklist.readable') },
    { icon: '📐', label: t('home.previewChecklist.notBlurry') },
  ];

  return (
    <AnimatePresence>
      {visible && previewUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-primary flex flex-col"
        >
          {/* Preview header */}
          <div className="px-5 pt-12 pb-4 flex items-center justify-between">
            <button
              onClick={onDismiss}
              className="flex items-center gap-1.5 text-white/60 text-sm font-medium"
            >
              <X className="w-4 h-4" />
              {t('home.cancel')}
            </button>
            <h2 className="font-display text-base font-bold text-white">
              {t('home.reviewPhoto')}
            </h2>
            <div className="w-16" />
          </div>

          {/* Image preview */}
          <div className="flex-1 flex items-center justify-center px-5 py-4 min-h-0">
            <div className="relative w-full max-h-full rounded-2xl overflow-hidden border-2 border-white/20">
              <img
                src={previewUrl}
                alt={t('home.receiptPreviewAlt')}
                className="w-full h-full object-contain"
                style={{ maxHeight: 'calc(100vh - 320px)' }}
              />
              {/* Corner frame guides */}
              {['top-0 left-0 border-l-2 border-t-2', 'top-0 right-0 border-r-2 border-t-2',
                'bottom-0 left-0 border-l-2 border-b-2', 'bottom-0 right-0 border-r-2 border-b-2'].map((cls, i) => (
                <div key={i} className={`absolute w-5 h-5 border-accent ${cls}`} />
              ))}
            </div>
          </div>

          {/* Checklist */}
          <div className="px-5 py-3">
            <p className="text-white/50 text-xs uppercase tracking-wider font-semibold mb-3 text-center">
              {t('home.checkBeforeScanning')}
            </p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {checklist.map((item) => (
                <div key={item.label} className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
                  <span className="text-base">{item.icon}</span>
                  <span className="text-white/80 text-xs font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-5 pb-10 flex gap-3">
            <button
              onClick={onRetake}
              className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl border border-white/20 text-white font-semibold text-sm active:scale-95 transition-transform"
            >
              <RotateCcw className="w-4 h-4" />
              {t('home.retake')}
            </button>
            <motion.button
              onClick={onConfirm}
              className="flex-1 py-4 rounded-2xl bg-accent text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-accent/40"
              whileTap={{ scale: 0.97 }}
            >
              {t('home.scanReceipt')}
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
