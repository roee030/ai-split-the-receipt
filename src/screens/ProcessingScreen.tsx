import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useSession } from '../context/SplitSessionContext';

export function ProcessingScreen() {
  const { session } = useSession();
  const { t } = useTranslation();
  const phase = session.processingPhase;

  const scanningMessages = t('processing.scanningMessages', { returnObjects: true }) as string[];
  const analyzingMessages = t('processing.analyzingMessages', { returnObjects: true }) as string[];

  const messages = phase === 'analyzing' ? analyzingMessages : scanningMessages;
  const [msgIndex, setMsgIndex] = useState(0);

  // Reset index whenever phase changes so we start fresh
  useEffect(() => {
    setMsgIndex(0);
  }, [phase]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % messages.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [messages]);

  const scanningLabel = t('processing.phases.scanning');
  const analyzingLabel = t('processing.phases.analyzing');
  const phaseLabel = phase === 'analyzing' ? analyzingLabel : scanningLabel;
  const phaseStep = phase === 'analyzing' ? 2 : 1;

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center gap-8 px-6">
      {/* Scanner animation */}
      <div className="relative w-48 h-48 rounded-2xl overflow-hidden bg-white/10">
        {/* Scanner line sweep */}
        <motion.div
          className="absolute left-0 right-0 h-0.5 bg-accent shadow-lg shadow-accent"
          initial={{ top: 0 }}
          animate={{ top: ['0%', '100%', '0%'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-6xl">{phase === 'analyzing' ? '🧠' : '🧾'}</span>
        </div>
      </div>

      {/* Phase indicator */}
      <div className="flex items-center gap-3">
        {([scanningLabel, analyzingLabel] as const).map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <span className="text-white/30 text-sm">→</span>}
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                label === phaseLabel
                  ? 'bg-accent text-white'
                  : label === scanningLabel && phaseStep === 2
                  ? 'bg-white/20 text-white/60'
                  : 'bg-white/10 text-white/30'
              }`}
            >
              {label === scanningLabel && phaseStep === 2 ? '✓ ' : ''}{label}
            </span>
          </div>
        ))}
      </div>

      {/* Rotating status */}
      <motion.div
        key={`${phase}-${msgIndex}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="text-white font-medium text-lg text-center"
      >
        {messages[msgIndex]}
      </motion.div>

      {/* Progress dots */}
      <div className="flex gap-2">
        {messages.map((_, i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full"
            animate={{ backgroundColor: i <= msgIndex ? '#FF6B35' : '#ffffff40' }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>
    </div>
  );
}
