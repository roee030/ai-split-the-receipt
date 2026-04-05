import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  visible: boolean;
  onClose: () => void;
  onOpenCamera: () => void;
}

export function CameraGuideOverlay({ visible, onClose, onOpenCamera }: Props) {
  const { t } = useTranslation();

  const CAMERA_TIPS = [
    { icon: '💡', text: t('home.cameraTips.lighting') },
    { icon: '📃', text: t('home.cameraTips.fullReceipt') },
    { icon: '📐', text: t('home.cameraTips.steady') },
    { icon: '🔍', text: t('home.cameraTips.readable') },
  ];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: 'rgba(13,13,26,0.85)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="bg-surface rounded-t-3xl p-6 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-6" />
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl font-bold text-primary">
                {t('home.photoTipsTitle')}
              </h2>
              <button
                onClick={onClose}
                aria-label={t('home.close')}
                className="text-muted p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-muted text-sm mb-5">{t('home.photoTipsSubtitle')}</p>

            <div className="space-y-3 mb-7">
              {CAMERA_TIPS.map((tip) => (
                <div key={tip.text} className="flex items-center gap-3 p-3 bg-bg rounded-xl">
                  <span className="text-xl w-8 text-center flex-shrink-0">{tip.icon}</span>
                  <span className="text-sm font-medium text-primary">{tip.text}</span>
                </div>
              ))}
            </div>

            <motion.button
              onClick={onOpenCamera}
              className="w-full py-4 rounded-2xl bg-accent text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-accent/30"
              whileTap={{ scale: 0.97 }}
            >
              <Camera className="w-5 h-5" />
              {t('home.openCamera')}
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
