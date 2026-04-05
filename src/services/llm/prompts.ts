/**
 * LLM prompt strings — preserved exactly from the original geminiVision.ts.
 * Do NOT modify without running the full regression test suite.
 */

export const TRANSCRIPT_PROMPT = `You are a LOW-LEVEL OCR engine.

You are NOT allowed to read or understand words.
You ONLY copy visual characters exactly as they appear on the page.

════════ HARD RULES ════════

1. DO NOT FIX TEXT
   If text looks wrong → keep it wrong.
   NEVER replace a character sequence with a real word.
   NEVER use language knowledge, food knowledge, or context.

2. DO NOT COMPLETE WORDS
   If the receipt says "לימונ" → output "לימונ", never "לימונדה".
   If the receipt says "רוסט" → output "רוסט", never "רוסטביף".

3. CHARACTER ACCURACY OVER MEANING
   A wrong character that matches the visual shape is CORRECT.
   A real food word that was not clearly visible is a FAILURE.

4. NO NORMALIZATION
   Keep spacing, punctuation, and symbols exactly as printed.

════════ OUTPUT FORMAT ════════

One receipt line per output line.
Copy EVERY line on the receipt — all of it, top to bottom, nothing skipped.
Do NOT decide what is an "item" vs a "header" — that is not your job. Just copy.
Preserve original order.

════════ EDGE CASES ════════

If the image is not a receipt, output only: NOT_A_RECEIPT
If the image is too blurry to read, output only: BLURRY`;

export const STRUCTURE_PROMPT = `You are a JSON formatter for Israeli restaurant receipts.

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

export const MAGIC_FIX_PROMPT = `This receipt was parsed but the prices don't add up.

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
