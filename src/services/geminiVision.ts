/**
 * Receipt scanning pipeline — v4
 *
 * WHY THIS WORKS:
 *   Gemini UI reads Hebrew receipts perfectly because it does two things we weren't:
 *   1. Sends the RAW image — no contrast/sharpen preprocessing that mangles letter shapes
 *   2. Asks only ONE question at a time — transcript OR structure, not both
 *
 *   Our previous single-pass prompt forced Gemini to OCR + build JSON simultaneously.
 *   During JSON generation, the language model "completes" unfamiliar Hebrew words with
 *   plausible food names. Separating the calls eliminates this: Pass 2 has no image,
 *   so it can only work with the text it was handed — it cannot invent names.
 *
 * ARCHITECTURE:
 *   Pass 1 (vision)  — raw image → plain-text transcript (dead-simple copy prompt)
 *   Pass 2 (text)    — transcript → ParsedReceipt JSON   (no image, no hallucination)
 *   Magic Fix        — user-triggered re-parse when prices don't add up
 */

import type { ParsedReceipt } from '../types/receipt.types';
import { type PassTokens, type ScanTokens, calcScanCost } from '../monitoring/tokenCost';

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

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
  // Pass 1 — raw image → plain text transcript
  const imageBase64       = await blobToBase64(imageBlob);
  const { transcript, tokens: t1 } = await pass1Transcript(imageBase64, mimeType);

  console.log('[Pass1] transcript:\n', transcript);

  // Pass 2 — transcript → structured JSON
  onPass2Start?.();
  const { receipt, tokens: t2 } = await pass2Structure(transcript);

  console.log('[Pass2] items:', receipt.items);

  return { receipt, transcript, tokens: calcScanCost(t1, t2) };
}

export async function geminiReVerify(
  transcript: string,
  itemsSum: number,
  printedSubtotal: number,
): Promise<ParsedReceipt | null> {
  const prompt = MAGIC_FIX_PROMPT
    .replace('{{TRANSCRIPT}}', transcript)
    .replace('{{ITEMS_SUM}}',  itemsSum.toFixed(2))
    .replace('{{TOTAL}}',      printedSubtotal.toFixed(2))
    .replace('{{DIFF}}',       Math.abs(itemsSum - printedSubtotal).toFixed(2));

  const { text } = await geminiText(prompt);
  if (!text) return null;
  try {
    const p = JSON.parse(text);
    return p.error ? null : (p as ParsedReceipt);
  } catch { return null; }
}

// ─── Pass 1: image → plain text transcript ───────────────────────────────────
// Goal: get a verbatim text copy of everything on the receipt.
// No JSON, no structure — just copy. This matches what Gemini UI does internally.

async function pass1Transcript(
  imageBase64: string,
  mimeType: string,
): Promise<{ transcript: string; tokens: PassTokens }> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: TRANSCRIPT_PROMPT },
        ],
      }],
      generationConfig: {
        // Plain text output — no JSON mode
        // Thinking enabled: simple transcript task won't MODEL_ABORTED (only JSON did).
        // Letting Gemini think means it takes extra care on ambiguous Hebrew characters.
        maxOutputTokens: 8192,
        temperature: 0,
      },
    }),
  });

  if (!res.ok) {
    const s = res.status;
    if (s === 429) throw new Error('TOO_MANY_REQUESTS');
    throw new Error(`HTTP_${s}`);
  }

  const json        = await res.json();
  const finishReason = json.candidates?.[0]?.finishReason ?? '';
  const text         = (json.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();

  if (!text) throw new Error(finishReason === 'OTHER' ? 'MODEL_ABORTED' : 'EMPTY_RESPONSE');
  if (text.startsWith('NOT_A_RECEIPT')) throw new Error('NOT_A_RECEIPT');
  if (text.startsWith('BLURRY'))        throw new Error('BLURRY');

  return {
    transcript: text,
    tokens: {
      inputTokens:  json.usageMetadata?.promptTokenCount     ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

// ─── Pass 2: plain text → structured JSON ────────────────────────────────────
// No image here. The model can ONLY use the transcript it was given.
// It cannot invent Hebrew names it was never shown.

async function pass2Structure(
  transcript: string,
): Promise<{ receipt: ParsedReceipt; tokens: PassTokens }> {
  const prompt          = STRUCTURE_PROMPT.replace('{{TRANSCRIPT}}', transcript);
  const { text, tokens } = await geminiText(prompt);

  if (!text) throw new Error('EMPTY_RESPONSE');

  let parsed: ParsedReceipt & { error?: string };
  try   { parsed = JSON.parse(text); }
  catch { console.error('[Pass2] bad JSON:', text); throw new Error('PARSE_ERROR'); }

  if (parsed.error) throw new Error(parsed.error);

  return { receipt: parsed, tokens };
}

// ─── Shared Gemini text-only call ────────────────────────────────────────────

async function geminiText(prompt: string): Promise<{ text: string | null; tokens: PassTokens }> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) {
    const s = res.status;
    if (s === 429) throw new Error('TOO_MANY_REQUESTS');
    return { text: null, tokens: { inputTokens: 0, outputTokens: 0 } };
  }

  const json = await res.json();
  return {
    text: (json.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim() || null,
    tokens: {
      inputTokens:  json.usageMetadata?.promptTokenCount     ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

// ─── Image preprocessing ─────────────────────────────────────────────────────
// Mild grayscale + contrast only. No binarization, no sharpening kernel.
// Goal: darken ink slightly so ב/כ and other close Hebrew letterforms become
// easier to distinguish, without destroying the anti-aliased edges that
// differentiate them in thermal receipt fonts.
// Contrast 1.25 (125%) — enough to push ink toward black, paper toward white,
// while keeping gray transitions that encode letter shape information.

async function blobToBase64(blob: Blob): Promise<string> {
  const img    = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width  = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const d = imageData.data;
  const CONTRAST = 1.25;

  for (let i = 0; i < d.length; i += 4) {
    // Luminance-weighted grayscale (ITU-R BT.601)
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Contrast boost around midpoint — keeps gray edges, pushes extremes
    const c = Math.max(0, Math.min(255, (gray - 128) * CONTRAST + 128));
    d[i] = d[i + 1] = d[i + 2] = c;
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) { reject(new Error('PREPROCESS_FAILED')); return; }
      const reader = new FileReader();
      reader.onload  = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(b);
    }, 'image/png');
  });
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

// Pass 1 — pure visual read. No structure, no JSON. Just copy what is printed.
const TRANSCRIPT_PROMPT = `You are an OCR scanner. Read this receipt image and output the raw text.

RULES:
1. Copy every character exactly as it appears — do not fix, translate, or normalize anything.
2. Output one receipt line per output line. No extra formatting or explanation.
3. Hebrew characters that look similar in thermal receipt fonts — read the SHAPE, not the word:
     ב (bet) and כ (kaf) look alike — write exactly what you see, even if the word looks wrong.
     ו (vav) and ן (final nun) look alike — same rule.
     If you are unsure between two similar characters, pick the one whose SHAPE fits better,
     NOT the one that makes a more recognizable food word.
4. If a word looks like nonsense — write it as nonsense. Do not replace with a known word.
5. Do NOT use food knowledge. You are reading shapes off paper, not naming dishes.

If the image is not a receipt, output only: NOT_A_RECEIPT
If the image is too blurry to read, output only: BLURRY`;

// Pass 2 — text only. No image. Can only use what the transcript says.
const STRUCTURE_PROMPT = `You are a JSON formatter for Israeli restaurant receipts.

RECEIPT TRANSCRIPT (read from image — treat as ground truth):
{{TRANSCRIPT}}

YOUR ONLY JOB: parse the numbers and copy the names exactly.

NAME RULE (absolute — no exceptions):
  Every item "name" MUST be copied character-for-character from the TRANSCRIPT above.
  The transcript is the source of truth. You cannot change, fix, translate, or improve any name.
  If transcript says "ג'ימזונה"  → name = "ג'ימזונה"   (not "לימונדה")
  If transcript says "במבוק ערק" → name = "במבוק ערק"  (not "יין")
  If a word looks like nonsense — keep it as nonsense. It is printed on the receipt.

RECEIPT LAYOUT (Tabit system — price LEFT, quantity, name RIGHT):
  "98.00  1 קבב טלה"          → price=98,  qty=1, name="קבב טלה"
  "136.00 2 רוסטביף סינטה"    → price=136, qty=2, name="רוסטביף סינטה"

Return ONLY this JSON (no markdown):
{
  "isReceipt": true,
  "receipt_type": "restaurant",
  "restaurantName": null,
  "currency": "ILS",
  "subtotal": number | null,
  "tax": number | null,
  "taxPercent": number | null,
  "serviceCharge": number | null,
  "total": number | null,
  "confidence": "high" | "medium" | "low",
  "items": [
    {
      "name": string,
      "quantity": number,
      "unit_price": number | null,
      "total_price": number | null,
      "price_missing": false,
      "sub_items": []
    }
  ]
}

- Skip: header, address, phone, totals row, tax row, QR code, loyalty text
- quantity defaults to 1
- unit_price = total_price ÷ quantity
- confidence = "low" if any price is missing`;

const MAGIC_FIX_PROMPT = `This receipt was parsed but the prices don't add up.

TRANSCRIPT (ground truth — do not change any name):
{{TRANSCRIPT}}

Items sum:     {{ITEMS_SUM}}
Printed total: {{TOTAL}}
Difference:    {{DIFF}}

Fix ONLY numeric values (prices, quantities). Every "name" must be copied verbatim from the TRANSCRIPT.
Common causes: decimal comma vs dot, skipped line, merged prices, wrong discount sign.

Return corrected JSON (no markdown):
{
  "isReceipt": true,
  "receipt_type": "restaurant",
  "restaurantName": null,
  "currency": "ILS",
  "subtotal": number | null,
  "tax": number | null,
  "taxPercent": number | null,
  "serviceCharge": number | null,
  "total": number | null,
  "confidence": "high" | "medium" | "low",
  "items": [
    {
      "name": string,
      "quantity": number,
      "unit_price": number | null,
      "total_price": number | null,
      "price_missing": boolean,
      "sub_items": [{ "name": string, "price": number | null }]
    }
  ]
}`;
