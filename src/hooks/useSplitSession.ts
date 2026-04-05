import { useState, useCallback, useEffect } from 'react';
import type { SplitSession, Screen } from '../types/split.types';
import { makeItemOperations } from './session/useItemOperations';
import { makePersonOperations } from './session/usePersonOperations';
import { makeClaimOperations } from './session/useClaimOperations';
import { makeReceiptMeta } from './session/useReceiptMeta';

export function getLocalScansUsed(): number {
  return parseInt(localStorage.getItem('splitsnap_local_scans') ?? '0', 10);
}

export function incrementLocalScansUsed(): void {
  const next = getLocalScansUsed() + 1;
  localStorage.setItem('splitsnap_local_scans', String(next));
}

const DEFAULT_SESSION: SplitSession = {
  receiptItems: [],
  people: [],
  claims: [],
  tip: { mode: 'percent', value: 15, splitMode: 'proportional' },
  tax: 0,
  serviceCharge: 0,
  subtotal: null,
  restaurantName: null,
  currency: 'ILS',
  scanConfidence: null,
  splitMode: null,
  lastTranscript: null,
  processingPhase: null,
  debugImageUrl: null,
  autoFixed: false,
};

// Screens that get their own browser history entry (back-navigable)
const HISTORY_SCREENS = new Set<Screen>(['home', 'review', 'people', 'claim', 'tip', 'summary', 'roundrobin']);

function hashToScreen(hash: string): Screen {
  const s = hash.replace('#', '') as Screen;
  return HISTORY_SCREENS.has(s) ? s : 'home';
}

export function useSplitSession() {
  const [session, setSession] = useState<SplitSession>(DEFAULT_SESSION);
  const [screen, setScreenState] = useState<Screen>(() => hashToScreen(window.location.hash));
  const [activePersonIndex, setActivePersonIndex] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);

  // Sync screen → URL hash
  const setScreen = useCallback((s: Screen) => {
    setScreenState(s);
    if (s === 'home') {
      window.history.replaceState({ screen: s }, '', '#');
    } else if (HISTORY_SCREENS.has(s)) {
      window.history.pushState({ screen: s }, '', `#${s}`);
    }
    // 'processing' — transient, no history entry
  }, []);

  // Browser back/forward button
  useEffect(() => {
    const onPopState = () => {
      setScreenState(hashToScreen(window.location.hash));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const reset = useCallback(() => {
    setSession(DEFAULT_SESSION);
    setScreenState('home');
    setActivePersonIndex(0);
    setScanError(null);
    window.history.replaceState({ screen: 'home' }, '', '#');
  }, []);

  const { updateItem, deleteItem, addItem, setReceiptItems } = makeItemOperations(setSession);
  const { addPerson, removePerson, updatePersonName, setSplitMode } = makePersonOperations(setSession);
  const { claimItem, setClaimQuantity, setSharedClaim, splitEvenly } = makeClaimOperations(setSession);
  const {
    setTip,
    setTax,
    setServiceCharge,
    setReceiptData,
    setTranscript,
    setProcessingPhase,
    setDebugImageUrl,
  } = makeReceiptMeta(setSession);

  const unclaimedCount = session.receiptItems.filter(
    (item) => !session.claims.find((c) => c.itemId === item.id)
  ).length;

  return {
    session,
    screen,
    setScreen,
    activePersonIndex,
    setActivePersonIndex,
    scanError,
    setScanError,
    setReceiptData,
    updateItem,
    deleteItem,
    addItem,
    addPerson,
    removePerson,
    updatePersonName,
    claimItem,
    setClaimQuantity,
    setSharedClaim,
    splitRemainingEvenly: splitEvenly,
    setSplitMode,
    setTip,
    setTax,
    setServiceCharge,
    setTranscript,
    setProcessingPhase,
    setDebugImageUrl,
    setReceiptItems,
    reset,
    unclaimedCount,
  };
}

export type SplitSessionHook = ReturnType<typeof useSplitSession>;
