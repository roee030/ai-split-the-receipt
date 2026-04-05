import { useRef } from 'react';
import { useSession } from '../context/SplitSessionContext';
import { useAuth } from '../context/AuthContext';
import { prepareImage } from '../utils/imageResize';
import { scanReceipt } from '../services/geminiVision';
import { parseReceiptToItems } from '../services/receiptParser';
import { getLocalScansUsed, incrementLocalScansUsed } from './useSplitSession';
import { monitoring } from '../monitoring';

interface Options {
  scanningRef: React.MutableRefObject<boolean>;
  sourceRef: React.MutableRefObject<'camera' | 'upload'>;
  setScanCooldown: React.Dispatch<React.SetStateAction<number>>;
  setShowSignIn: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingFile: React.Dispatch<React.SetStateAction<File | null>>;
  setShowPaywall: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useScanAction({
  scanningRef,
  sourceRef,
  setScanCooldown,
  setShowSignIn,
  setPendingFile,
  setShowPaywall,
}: Options) {
  const { setScreen, setReceiptData, setScanError, setTranscript, setProcessingPhase, setDebugImageUrl } = useSession();
  const { user } = useAuth();
  const lastErrorCodeRef = useRef<string | null>(null);

  async function doScan(file: File) {
    if (scanningRef.current) return;
    scanningRef.current = true;
    if (lastErrorCodeRef.current) {
      monitoring.track('scan_retried', { previous_error_code: lastErrorCodeRef.current });
      lastErrorCodeRef.current = null;
    }
    monitoring.track('scan_started', { source: sourceRef.current });
    setScanCooldown(10);
    incrementLocalScansUsed();
    setScanError(null);
    setScreen('processing');
    setProcessingPhase('scanning');
    try {
      const { blob, mimeType } = await prepareImage(file);

      // DEV: store the actual JPEG data URL so ReviewScreen can expose it for inspection
      if (import.meta.env.DEV) {
        const reader = new FileReader();
        reader.onload = () => setDebugImageUrl(reader.result as string);
        reader.readAsDataURL(blob);
      }

      const { receipt, tokens, transcript, autoFixed } = await scanReceipt(
        blob,
        mimeType,
        () => setProcessingPhase('analyzing'),
      );
      const items = parseReceiptToItems(receipt, receipt.restaurantName);

      // DEV: log the final item mapping so we can see name→price after parsing
      if (import.meta.env.DEV) {
        console.log('[DEBUG] FINAL MAPPING', items.map(i => ({
          name: i.name,
          price: i.totalPrice,
          flagged: i.flagged ?? false,
        })));
      }
      setReceiptData(items, {
        restaurantName:  receipt.restaurantName,
        tax:             receipt.currency === 'ILS' ? 0 : (receipt.tax ?? 0),
        serviceCharge:   receipt.serviceCharge ?? 0,
        currency:        receipt.currency ?? 'ILS',
        subtotal:        receipt.subtotal ?? null,
        scanConfidence:  receipt.confidence ?? null,
        autoFixed,
      });
      setTranscript(transcript);
      setScreen('review');
      monitoring.track('scan_completed', {
        receipt_type: receipt.receipt_type ?? 'other',
        item_count: items.length,
        confidence: receipt.confidence ?? 'low',
        pass1_input_tokens: tokens.pass1.inputTokens,
        pass1_output_tokens: tokens.pass1.outputTokens,
        pass2_input_tokens: tokens.pass2.inputTokens,
        pass2_output_tokens: tokens.pass2.outputTokens,
        total_input_tokens: tokens.totalInputTokens,
        total_output_tokens: tokens.totalOutputTokens,
        estimated_cost_usd: tokens.estimatedCostUSD,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      const errorCode = raw || 'UNKNOWN';
      lastErrorCodeRef.current = errorCode;
      monitoring.track('scan_failed', {
        error_code: errorCode,
        failed_pass: raw.includes('BLURRY') || raw.includes('CROPPED') || raw.includes('LOW_LIGHT') || raw.includes('OCCLUDED') || raw.includes('NOT_A_RECEIPT') ? 1 : 2,
        total_input_tokens: 0,
        total_output_tokens: 0,
        estimated_cost_usd: 0,
      });
      let message: string | null = null;
      if (raw.includes('BLURRY')) {
        message = "The photo came out a bit blurry. Try holding the phone steadier and shoot again.";
      } else if (raw.includes('CROPPED')) {
        message = "Part of the receipt looks cut off. Make sure all edges are in frame.";
      } else if (raw.includes('LOW_LIGHT')) {
        message = "It's too dark here. Try turning on a light or using flash.";
      } else if (raw.includes('OCCLUDED')) {
        message = "Something is covering the text. Try shooting again with the receipt fully exposed.";
      } else if (raw.includes('NOT_A_RECEIPT')) {
        message = "We couldn't identify a receipt here. Make sure you're photographing a clear bill or receipt.";
      } else if (raw.includes('NO_ITEMS_FOUND')) {
        message = "We couldn't find any items. Try a better-lit photo.";
      } else if (raw.includes('SCAN_LIMIT_REACHED')) {
        setReceiptData([], {});
        setScreen('home');
        setShowPaywall(true);
        return;
      } else if (raw.includes('ANTHROPIC_AUTH_ERROR')) {
        message = "OCR authentication failed. Please check the API key configuration.";
      } else if (raw.includes('MODEL_ABORTED')) {
        message = "The scan was blocked by a content filter. Try a different photo or retake from a cleaner angle.";
      } else if (raw.includes('DAILY_QUOTA_EXCEEDED')) {
        message = 'Daily scan limit reached. Please try again tomorrow or add billing to your Gemini API project.';
      } else if (raw.includes('TOO_MANY_REQUESTS') || raw.includes('429')) {
        const delayMatch = raw.match(/TOO_MANY_REQUESTS:(\d+s)/);
        message = delayMatch
          ? `Rate limit reached. Please wait ${delayMatch[1]} before scanning again.`
          : 'Rate limit reached. Please wait a moment before scanning again.';
      } else {
        message = "Something went wrong. Please try again.";
      }
      setScanError(message);
      setReceiptData([], {});
      setScreen('home');
    } finally {
      scanningRef.current = false;
    }
  }

  async function handleFile(file: File) {
    // Soft gate: show sign-in on first scan if not signed in
    if (!user && getLocalScansUsed() === 0) {
      setPendingFile(file);
      setShowSignIn(true);
      return;
    }
    // Strong nudge: last free scan
    if (!user && getLocalScansUsed() === 4) {
      setPendingFile(file);
      setShowSignIn(true);
      return;
    }
    await doScan(file);
  }

  return { doScan, handleFile };
}
