/**
 * Receipt scanning pipeline
 *
 * Single pass — Gemini 2.5 Flash (vision)
 *   Image → structured ParsedReceipt JSON in one call
 *   Gemini reads Hebrew thermal receipts correctly.
 *   Claude cannot — it invents plausible-sounding Hebrew food names.
 *
 * Magic Fix — Gemini 2.5 Flash (text-only, triggered by user)
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
  const imageBase64 = await darkroom(imageBlob);

  const { receipt, transcript, tokens } = await geminiVisionScan(imageBase64, mimeType);

  // fire immediately — single pass, no real phase 2
  onPass2Start?.();

  const empty: PassTokens = { inputTokens: 0, outputTokens: 0 };
  return { receipt, transcript, tokens: calcScanCost(tokens, empty) };
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

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192, temperature: 0 },
    }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  try {
    const p = JSON.parse(text);
    return p.error ? null : (p as ParsedReceipt);
  } catch { return null; }
}

// ─── Gemini vision scan ───────────────────────────────────────────────────────

async function geminiVisionScan(
  imageBase64: string,
  mimeType: string,
): Promise<{ receipt: ParsedReceipt; transcript: string; tokens: PassTokens }> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: VISION_PROMPT },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 }, // prevent MODEL_ABORTED on OCR tasks
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

  let parsed: ParsedReceipt & { error?: string; raw_lines?: string[] };
  try   { parsed = JSON.parse(text); }
  catch { console.error('[Gemini] bad JSON:', text); throw new Error('PARSE_ERROR'); }

  if (parsed.error) throw new Error(parsed.error);

  // raw_lines is the plain text transcript for the debug panel and Magic Fix
  const transcript = Array.isArray(parsed.raw_lines)
    ? parsed.raw_lines.join('\n')
    : parsed.items.map(i => `${i.total_price ?? ''}  ${i.quantity ?? 1} ${i.name}`).join('\n');

  console.log('[Gemini] raw_lines:', parsed.raw_lines);
  console.log('[Gemini] items:', parsed.items);

  return {
    receipt: parsed,
    transcript,
    tokens: {
      inputTokens:  json.usageMetadata?.promptTokenCount     ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

// ─── Image pre-processing ─────────────────────────────────────────────────────
// Balanced grayscale + sharpen pipeline (replaces hard binarization).
//
// Why: pure binarization (snap to 0/255) merges thin strokes in Hebrew letters —
// ו and ן become indistinguishable blobs. Keeping anti-aliased gray edges lets
// the model distinguish close letterforms.
//
// Pipeline:
//   1. Convert to grayscale (ITU-R BT.601 luminance weights)
//   2. Apply contrast ×1.5 around midpoint (150% — enough to punch ink, not destroy edges)
//   3. Apply 3×3 sharpen convolution kernel to restore edge clarity
//   4. Output lossless PNG

async function darkroom(blob: Blob): Promise<string> {
  const img    = await createImageBitmap(blob);
  const W      = img.width;
  const H      = img.height;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const src = ctx.getImageData(0, 0, W, H);
  const d   = src.data;

  // Step 1 & 2 — grayscale + contrast 150% in-place
  // contrast formula: out = clamp((v - 128) * factor + 128)
  const CONTRAST = 1.5;
  const gray = new Uint8Array(W * H); // grayscale channel only
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const c = Math.max(0, Math.min(255, (g - 128) * CONTRAST + 128));
    gray[p] = c;
  }

  // Step 3 — sharpen with 3×3 kernel: center=5, neighbours=-1 (cross only)
  //  [ 0 -1  0 ]
  //  [-1  5 -1 ]
  //  [ 0 -1  0 ]
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p  = y * W + x;
      const c  = gray[p] * 5;
      const n  = y > 0     ? gray[(y - 1) * W + x] : gray[p];
      const s  = y < H - 1 ? gray[(y + 1) * W + x] : gray[p];
      const ww = x > 0     ? gray[y * W + (x - 1)] : gray[p];
      const e  = x < W - 1 ? gray[y * W + (x + 1)] : gray[p];
      out[p] = Math.max(0, Math.min(255, c - n - s - ww - e));
    }
  }

  // Step 4 — write back as grayscale RGB
  const result = ctx.createImageData(W, H);
  const rd = result.data;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    rd[i] = rd[i + 1] = rd[i + 2] = out[p];
    rd[i + 3] = 255;
  }
  ctx.putImageData(result, 0, 0);

  // Step 5 — lossless PNG output
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) { reject(new Error('DARKROOM_FAILED')); return; }
      const reader = new FileReader();
      reader.onload  = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(b);
    }, 'image/png');
  });
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const VISION_PROMPT = `You are a high-speed document scanner. You have ZERO creativity. You are a data formatter only.

═══ ZERO-HALLUCINATION RULES — ABSOLUTE, NO EXCEPTIONS ═══

RULE 1 — NAME INTEGRITY (most important):
  The "name" field in every item MUST be copied CHARACTER-FOR-CHARACTER from the receipt.
  If the receipt says "ג'ימזונה"  → name must be "ג'ימזונה"   (NOT "לימונדה")
  If the receipt says "במבוק ערק" → name must be "במבוק ערק"  (NOT "יין" or "ערק")
  If the receipt says "Shrimpp"   → name must be "Shrimpp"     (NOT "Shrimp")
  You are NOT allowed to fix, translate, normalize, or improve any name. Ever.

RULE 2 — NO INVENTION:
  Every item in "items" MUST appear in "raw_lines". You cannot add items that aren't in raw_lines.
  If you cannot find an item in raw_lines, do not include it.

RULE 3 — UNCLEAR CHARACTERS:
  If a character is unreadable, write * (asterisk). Do not substitute a "likely" letter.
  If a whole word looks like an unclear mix of shapes, write it exactly as you see it — even
  if it looks like nonsense. Do NOT replace it with a similar food item you know.

RULE 4 — ZERO CREATIVITY:
  You are not a restaurant expert. You do not know food names. You only see shapes on paper.
  Treat every word — Hebrew, English, or mixed — as an unknown sequence of shapes.

RULE 5 — CONFIDENCE MARKER:
  If you are not 100% certain about a word, append a ? directly after it (no space).
  Examples: "במבוק? ערק"  /  "ג'ימזונה? ×2"  /  "קוק?טייל"
  This applies to both raw_lines and items[].name — use the same marked string in both.

═══ RECEIPT LAYOUT (Tabit system) ═══
Each item line: PRICE on LEFT, then QUANTITY (1 2 3…), then ITEM NAME in Hebrew on right.
  "98.00  1 קבב טלה"          → price=98,  qty=1, name="קבב טלה"
  "136.00 2 רוסטביף סינטה"    → price=136, qty=2, name="רוסטביף סינטה"
  "713.00 1 פריט כללי מטבח"   → price=713, qty=1, name="פריט כללי מטבח"

═══ OUTPUT FORMAT ═══
Return ONLY this JSON (no markdown, no explanation):
{
  "raw_lines": ["exact verbatim text of each item line as seen in image"],
  "isReceipt": true,
  "receipt_type": "restaurant",
  "restaurantName": string | null,
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

MAPPING RULE: items[i].name = the name portion of raw_lines[i], copied verbatim.

- Skip: header, address, phone, totals row, tax row, QR code, loyalty text
- quantity defaults to 1
- unit_price = total_price ÷ quantity
- confidence = "low" if any price is unreadable
- Unreadable image → {"error":"BLURRY"}
- Not a receipt   → {"error":"NOT_A_RECEIPT"}`;

const MAGIC_FIX_PROMPT = `This receipt was parsed but prices don't add up.

TRANSCRIPT:
{{TRANSCRIPT}}

Items sum:     {{ITEMS_SUM}}
Printed total: {{TOTAL}}
Difference:    {{DIFF}}

STRICT RULES:
- Fix ONLY numeric values (prices, quantities). NEVER change any item name.
- Every "name" field must be copied verbatim from the TRANSCRIPT above.
- Do not translate, normalize, or correct any word in any name field.
Common causes of mismatch: decimal comma vs dot, skipped line, merged prices, wrong discount sign.

Return corrected JSON (no markdown):
{
  "isReceipt": true,
  "receipt_type": "restaurant",
  "restaurantName": string | null,
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
