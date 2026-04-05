import type { SplitSession, TipConfig } from '../../types/split.types';
import type { ReceiptItem } from '../../types/receipt.types';
import type { Dispatch, SetStateAction } from 'react';

type Setter = Dispatch<SetStateAction<SplitSession>>;

export function makeReceiptMeta(setSession: Setter) {
  return {
    setTip: (tip: TipConfig) =>
      setSession((s) => ({ ...s, tip })),

    setTax: (tax: number) =>
      setSession((s) => ({ ...s, tax })),

    setServiceCharge: (serviceCharge: number) =>
      setSession((s) => ({ ...s, serviceCharge })),

    setReceiptData: (items: ReceiptItem[], meta: Partial<SplitSession>) =>
      setSession((s) => ({ ...s, ...meta, receiptItems: items, claims: [] })),

    setTranscript: (transcript: string) =>
      setSession((s) => ({ ...s, lastTranscript: transcript })),

    setProcessingPhase: (phase: SplitSession['processingPhase']) =>
      setSession((s) => ({ ...s, processingPhase: phase })),

    setDebugImageUrl: (url: string | null) =>
      setSession((s) => ({ ...s, debugImageUrl: url })),
  };
}
