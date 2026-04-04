/**
 * Receipt scanning orchestrator — v5
 *
 * Provider-agnostic: which AI model runs each pass is driven by
 * src/config/providers.ts (env-flag switching — no code changes needed).
 *
 * ARCHITECTURE:
 *   Pass 1 (vision)  — transcribeImage()    → plain-text transcript
 *   Pass 2 (text)    — structureTranscript() → ParsedReceipt JSON
 *   Magic Fix        — magicFix()            → corrected ParsedReceipt
 *
 * To switch a provider: set VITE_PASS1_PROVIDER / VITE_PASS2_PROVIDER /
 * VITE_MAGIC_PROVIDER in .env.local and restart the dev server.
 */

import type { ParsedReceipt } from '../types/receipt.types';
import { type ScanTokens, calcScanCost } from '../monitoring/tokenCost';
import { PROVIDERS } from '../config/providers';
import { transcribeImage, structureTranscript, magicFix } from './llmAdapters';

// ─────────────────────────────────────────────────────────────────────────────

export type ScanResult = {
  receipt: ParsedReceipt;
  tokens: ScanTokens;
  transcript: string;
};

export async function scanReceipt(
  imageBlob: Blob,
  mimeType: string,
  onPass2Start?: () => void,
): Promise<ScanResult> {
  const imageBase64 = await blobToBase64(imageBlob);

  // Pass 1 — vision OCR
  const { transcript, tokens: t1 } = await transcribeImage(imageBase64, mimeType, PROVIDERS.pass1);
  console.log(`[Pass1] provider:${PROVIDERS.pass1}\n`, transcript);

  // Brief pause — prevents per-minute rate-limit when both passes use the same provider
  await new Promise(r => setTimeout(r, 1500));

  // Pass 2 — text → structured JSON
  onPass2Start?.();
  const { receipt, tokens: t2 } = await structureTranscript(transcript, PROVIDERS.pass2);
  console.log(`[Pass2] provider:${PROVIDERS.pass2}`, receipt.items);

  return { receipt, transcript, tokens: calcScanCost(t1, t2) };
}

export async function geminiReVerify(
  transcript: string,
  itemsSum: number,
  printedSubtotal: number,
): Promise<ParsedReceipt | null> {
  return magicFix(transcript, itemsSum, printedSubtotal, PROVIDERS.magic);
}

// ─── Image → base64 (no preprocessing) ───────────────────────────────────────
// Raw image sent directly — preprocessing was tested and consistently made
// Hebrew letter recognition worse by mangling anti-aliased stroke edges.

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
