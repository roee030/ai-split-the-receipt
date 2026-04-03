import type { ParsedReceipt } from '../types/receipt.types';
import { type PassTokens, type ScanTokens, calcScanCost } from '../monitoring/tokenCost';

// Single model for everything: Gemini 2.5 Flash handles vision + structure in one shot.
// It reads Hebrew receipts correctly and is free-tier for moderate usage.
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

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

  console.log(`[DEBUG] Image Chars: ${imageBase64.length} (~${Math.round(imageBase64.length * 0.75 / 1024)} KB)`);

  // Single pass: Gemini vision reads the image and returns structured JSON directly.
  // This avoids the 2-call rate-limit problem and eliminates Claude hallucination issues.
  const { receipt, transcript, tokens: pass1Tokens } = await geminiVisionScan(imageBase64, mimeType);

  // Fire the "analyzing" phase callback immediately (single-pass, no real phase 2)
  onPass2Start?.();

  // pass2 is empty — we only have one Gemini call now
  const emptyPass: PassTokens = { inputTokens: 0, outputTokens: 0 };
  const tokens = calcScanCost(pass1Tokens, emptyPass);

  return { receipt, tokens, transcript };
}

/**
 * Magic Fix (Pass 2) — called when the user taps "Magic Fix".
 * Re-sends the stored transcript + mismatch context to Gemini (text-only, cheap).
 */
export async function geminiReVerify(
  transcript: string,
  itemsSum: number,
  printedSubtotal: number,
): Promise<ParsedReceipt | null> {
  const diff = Math.abs(itemsSum - printedSubtotal);

  const prompt = `The following receipt transcript was parsed but the item prices don't add up to the printed total.

TRANSCRIPT:
${transcript}

CURRENT PARSED ITEMS SUM: ${itemsSum.toFixed(2)}
RECEIPT PRINTED TOTAL: ${printedSubtotal.toFixed(2)}
DIFFERENCE: ${diff.toFixed(2)}

Re-examine the transcript carefully. Common causes:
- A price was misread (especially comma vs dot decimal: "25,90" should be 25.90)
- An item line was skipped entirely
- Two adjacent item prices were merged into one
- A discount was incorrectly subtracted from an item's total_price instead of being a sub_item

Return ONLY the corrected full JSON object. Do not explain, do not use markdown. Use this exact schema:
{
  "receipt_type": "grocery" | "restaurant" | "gas" | "other",
  "restaurant_name": string | null,
  "currency": string,
  "subtotal": number | null,
  "tax": number | null,
  "service_charge": number | null,
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

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) return null;

  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed.error) return null;
    return parsed as ParsedReceipt;
  } catch {
    return null;
  }
}

// ─── Single-pass Gemini Vision ────────────────────────────────────────────────

async function geminiVisionScan(
  imageBase64: string,
  mimeType: string,
): Promise<{ receipt: ParsedReceipt; transcript: string; tokens: PassTokens }> {
  const response = await fetch(GEMINI_URL, {
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
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new Error('TOO_MANY_REQUESTS');
    throw new Error(`HTTP_${status}`);
  }

  const json = await response.json();
  const finishReason: string = json.candidates?.[0]?.finishReason ?? '';
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (!text.trim()) {
    throw new Error(finishReason === 'OTHER' ? 'MODEL_ABORTED' : 'EMPTY_RESPONSE');
  }

  const tokens: PassTokens = {
    inputTokens:  json.usageMetadata?.promptTokenCount     ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };

  const parsed = JSON.parse(text);
  if (parsed.error) throw new Error(parsed.error as string);

  // transcript = the raw_lines Gemini saw, for Magic Fix and the debug panel
  const transcript: string = Array.isArray(parsed.raw_lines)
    ? (parsed.raw_lines as string[]).join('\n')
    : '';

  console.log('--- [DEBUG] GEMINI VISION: raw_lines ---', parsed.raw_lines);
  console.log('--- [DEBUG] GEMINI VISION: structured ---', parsed);

  return { receipt: parsed as ParsedReceipt, transcript, tokens };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const VISION_PROMPT = `You are a receipt scanning engine. Look at this receipt image and return a single JSON object.

STEP 1 — READ THE IMAGE EXACTLY:
Read every item line character-by-character. DO NOT guess, translate, or substitute words.
- If you see "סן פלגרינו" write "סן פלגרינו" — never "בירה"
- If you see "לימונענע גרוס" write "לימונענע גרוס" — never "מיץ"
- If a word is truly unreadable write [?]

ISRAELI RECEIPT LAYOUT (Tabit / Cafe Cafe):
Lines are read LEFT TO RIGHT. The LEFT number is the PRICE. The RIGHT side is QUANTITY then ITEM NAME.
Example: "98.00   1 עוף בצל"  →  price=98.00, quantity=1, name="עוף בצל"
Example: "136.00  2 חומוסים סיגרה"  →  unit_price=68.00, total_price=136.00, quantity=2, name="חומוסים סיגרה"
DO NOT confuse the price for the quantity.

Sub-items (toppings / discounts) appear indented or with >> / + / - prefix.
Discount lines have a minus sign: "-10.00 הנחה" → sub_item with price: -10

STEP 2 — RETURN THIS EXACT JSON (no markdown, no explanation):
{
  "raw_lines": ["exact text of each item line as you read it from the image"],
  "isReceipt": true,
  "receipt_type": "restaurant",
  "restaurant_name": string | null,
  "currency": "ILS",
  "subtotal": number | null,
  "tax": number | null,
  "taxPercent": number | null,
  "service_charge": number | null,
  "total": number | null,
  "confidence": "high" | "medium" | "low",
  "items": [
    {
      "name": "exact name from image",
      "quantity": 1,
      "unit_price": number | null,
      "total_price": number | null,
      "price_missing": false,
      "sub_items": []
    }
  ]
}

Rules:
- quantity defaults to 1 if not shown
- unit_price = total_price / quantity
- total_price = unit_price × quantity
- If a price is unreadable: unit_price: null, total_price: null, price_missing: true
- confidence = "low" if any price is missing or data is ambiguous
- Ignore: restaurant header, address, phone, loyalty points, QR codes, totals rows
- If image is not a receipt or is unreadable: { "error": "NOT_A_RECEIPT" } or { "error": "BLURRY" }`;
