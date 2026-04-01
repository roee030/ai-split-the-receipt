import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

const STEPS = [
  {
    step: 1,
    title: 'Scan your receipt',
    message: 'Tap here to photograph your receipt — AI reads it in seconds',
    placement: 'below' as const,
  },
  {
    step: 2,
    title: 'Review items',
    message: 'Check the items — tap any row to fix a name or price',
    placement: 'below' as const,
  },
  {
    step: 3,
    title: 'Claim what you ate',
    message: 'Each person taps what they ate — long-press to split a dish',
    placement: 'below' as const,
  },
  {
    step: 4,
    title: 'Share the total',
    message: "Everyone sees exactly what they owe — share straight to WhatsApp",
    placement: 'above' as const,
  },
];

export type CoachStep = typeof STEPS[number];

interface CoachMarkContextValue {
  currentStep: number | null;
  advanceStep: () => void;
  skipTour: () => void;
  startTour: () => void;
  steps: typeof STEPS;
}

const CoachMarkContext = createContext<CoachMarkContextValue>({
  currentStep: null,
  advanceStep: () => {},
  skipTour: () => {},
  startTour: () => {},
  steps: STEPS,
});

export function CoachMarkProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!user || initialized.current) return;
    initialized.current = true;

    async function checkOnboarding() {
      if (!user) return;
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists() || snap.data().onboardingComplete !== true) {
        setCurrentStep(1);
      }
    }

    checkOnboarding();
  }, [user]);

  async function markComplete() {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, { onboardingComplete: true }, { merge: true });
  }

  function advanceStep() {
    setCurrentStep((s) => {
      if (s === null || s >= STEPS.length) {
        markComplete();
        return null;
      }
      return s + 1;
    });
  }

  function skipTour() {
    setCurrentStep(null);
    markComplete();
  }

  function startTour() {
    setCurrentStep(1);
  }

  return (
    <CoachMarkContext.Provider value={{ currentStep, advanceStep, skipTour, startTour, steps: STEPS }}>
      {children}
    </CoachMarkContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCoachMark() {
  return useContext(CoachMarkContext);
}
