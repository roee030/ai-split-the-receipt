import { useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCoachMark } from '../../context/CoachMarkContext';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function CoachMarkOverlay() {
  const { currentStep, advanceStep, skipTour, steps } = useCoachMark();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const rafRef = useRef<number | null>(null);

  const stepDef = steps.find((s) => s.step === currentStep) ?? null;

  useLayoutEffect(() => {
    if (currentStep === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTargetRect(null);
      return;
    }

    function measure() {
      const el = document.querySelector(`[data-coach-step="${currentStep}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
      rafRef.current = requestAnimationFrame(measure);
    }

    rafRef.current = requestAnimationFrame(measure);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [currentStep]);

  const PAD = 8;

  return (
    <AnimatePresence>
      {currentStep !== null && stepDef && targetRect && (
        <motion.div
          key={currentStep}
          className="fixed inset-0 z-50 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Dark backdrop with SVG cutout spotlight */}
          <svg
            className="absolute inset-0 w-full h-full"
            style={{ pointerEvents: 'none' }}
          >
            <defs>
              <mask id="coach-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={targetRect.left - PAD}
                  y={targetRect.top - PAD}
                  width={targetRect.width + PAD * 2}
                  height={targetRect.height + PAD * 2}
                  rx="12"
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.65)"
              mask="url(#coach-mask)"
            />
          </svg>

          {/* Tooltip */}
          <div
            className="absolute pointer-events-auto bg-white rounded-2xl p-4 shadow-2xl w-72"
            style={
              stepDef.placement === 'below'
                ? {
                    top: targetRect.top + targetRect.height + PAD + 12,
                    left: Math.max(16, Math.min(targetRect.left, window.innerWidth - 304)),
                  }
                : {
                    bottom: window.innerHeight - (targetRect.top - PAD - 12),
                    left: Math.max(16, Math.min(targetRect.left, window.innerWidth - 304)),
                  }
            }
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                {currentStep} of {steps.length}
              </span>
              <button
                onClick={skipTour}
                className="text-xs text-gray-400 underline"
              >
                Skip tour
              </button>
            </div>
            <h3 className="font-bold text-gray-900 text-sm mb-1">{stepDef.title}</h3>
            <p className="text-xs text-gray-500 leading-snug mb-4">{stepDef.message}</p>
            <button
              onClick={advanceStep}
              className="w-full py-2.5 bg-orange-500 text-white font-bold text-sm rounded-xl"
            >
              {currentStep < steps.length ? 'Next →' : 'Done ✓'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
