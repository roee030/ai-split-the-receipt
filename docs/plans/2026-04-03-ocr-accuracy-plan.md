# OCR Accuracy & Magic Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix missing/wrong prices in Gemini receipt scanning and add a user-triggered "Magic Fix" button that fires a 3rd Gemini call to recover from mismatch errors.

**Architecture:** Types first (Task 1), then parser with TDD (Task 2), then session plumbing (Task 3), then Gemini service (Task 4), then UI wiring (Tasks 5–6), then monitoring event (Task 7). Each task is independently committable.

**Tech Stack:** TypeScript, Vitest (tests), React (UI), Gemini 2.5 Flash REST API

**Reference design:** `docs/plans/2026-04-03-ocr-accuracy-design.md`

---

## Task 1: Update types

**Files:**
- Modify: `src/types/receipt.types.ts`
- Modify: `src/types/split.types.ts`

**Step 1: Update `RawReceiptItem` in `receipt.types.ts`**

Change `unit_price` and `total_price` from `number` to `number | null`, and add `price_missing?`:

```typescript
export interface RawReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category: 'food' | 'drink' | 'dessert' | 'other';
  sub_items?: RawSubItem[];
  unit_price?: number | null;   // Gemini field name (snake_case)
  total_price?: number | null;  // Gemini field name (snake_case)
  price_missing?: boolean;
}
```

Also update `RawSubItem` to allow null price:
```typescript
export interface RawSubItem {
  name: string;
  price: number | null; // positive = extra, negative = discount, null = unreadable
}
```

**Step 2: Add `lastTranscript` to `SplitSession` in `split.types.ts`**

```typescript
export interface SplitSession {
  receiptItems: ReceiptItem[];
  people: Person[];
  claims: ItemClaim[];
  tip: TipConfig;
  tax: number;
  serviceCharge: number;
  subtotal: number | null;
  restaurantName: string | null;
  currency: string;
  scanConfidence: 'high' | 'medium' | 'low' | null;
  splitMode: 'solo' | 'whole' | 'some' | null;
  lastTranscript: string | null;   // ← ADD THIS
}
```

**Step 3: TypeScript check**

```bash
cd /c/Users/roeea/OneDrive/Documents/Github/ai-split-the-recipe && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only in files that use `lastTranscript` (not yet added) — fix those by adding `lastTranscript: null` to `DEFAULT_SESSION` in `useSplitSession.ts` right now.

In `useSplitSession.ts`, find `DEFAULT_SESSION` and add:
```typescript
lastTranscript: null,
```

Run `npx tsc --noEmit` again — should be clean.

**Step 4: Commit**

```bash
git add src/types/receipt.types.ts src/types/split.types.ts src/hooks/useSplitSession.ts
git commit -m "feat: add price_missing flag, nullable prices, lastTranscript to session types"
```

---

## Task 2: Fix receiptParser.ts (TDD)

**Files:**
- Modify: `src/services/receiptParser.ts`
- Create: `src/services/__tests__/receiptParser.test.ts`

**Step 1: Write failing tests**

Create `src/services/__tests__/receiptParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parsePrice } from '../receiptParser';

describe('parsePrice', () => {
  it('returns number as-is', () => {
    expect(parsePrice(25.9)).toBe(25.9);
  });

  it('handles null → 0', () => {
    expect(parsePrice(null)).toBe(0);
  });

  it('handles undefined → 0', () => {
    expect(parsePrice(undefined)).toBe(0);
  });

  it('strips ₪ symbol', () => {
    expect(parsePrice('₪25.90')).toBe(25.9);
  });

  it('strips $ symbol', () => {
    expect(parsePrice('$12.50')).toBe(12.5);
  });

  it('converts comma decimal separator', () => {
    expect(parsePrice('25,90')).toBe(25.9);
  });

  it('handles thousands separator with comma', () => {
    expect(parsePrice('1,250.00')).toBe(1250);
  });

  it('handles price with trailing ₪', () => {
    expect(parsePrice('25.90₪')).toBe(25.9);
  });

  it('returns 0 for unparseable string', () => {
    expect(parsePrice('???')).toBe(0);
  });
});
```

**Step 2: Run tests to verify they FAIL**

```bash
cd /c/Users/roeea/OneDrive/Documents/Github/ai-split-the-recipe && npx vitest run src/services/__tests__/receiptParser.test.ts 2>&1 | tail -15
```

Expected: FAIL — `parsePrice is not exported`.

**Step 3: Add `parsePrice` to `receiptParser.ts`**

Add this function at the top of the file (before `parseReceiptToItems`):

```typescript
/**
 * Safely converts any price value from Gemini to a JS number.
 * Handles: null/undefined → 0, currency symbols (₪$€£¥), comma decimal separators,
 * thousands separators. This is the last line of defence after the prompt fix.
 */
export function parsePrice(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const str = String(raw).trim();
  // Strip currency symbols
  const stripped = str.replace(/[₪$€£¥]/g, '').trim();
  // Handle comma as decimal separator: "25,90" → "25.90"
  // But not thousands separator: "1,250.00" stays as "1250.00"
  const normalized = stripped.replace(/,(\d{2})$/, '.$1').replace(/,/g, '');
  const result = parseFloat(normalized);
  return isNaN(result) ? 0 : result;
}
```

**Step 4: Fix `parseReceiptToItems` — use `parsePrice` and handle `price_missing`**

Replace the existing `parseReceiptToItems` function body with this version:

```typescript
export function parseReceiptToItems(parsed: ParsedReceipt): ReceiptItem[] {
  return parsed.items.map((item) => {
    const qty = item.quantity || 1;

    // Use snake_case fields from Gemini if camelCase not set
    const rawTotal = item.totalPrice ?? (item as Record<string, unknown>).total_price;
    const rawUnit  = item.unitPrice  ?? (item as Record<string, unknown>).unit_price;
    const priceMissing = !!(item as Record<string, unknown>).price_missing;

    const basePrice = parsePrice(rawTotal);
    const unitPrice = parsePrice(rawUnit);

    // Sum all sub_item prices (extras add, discounts subtract)
    const subItems = item.sub_items ?? [];
    const subTotal = subItems.reduce((sum, si) => sum + parsePrice(si.price), 0);
    const effectiveTotalPrice = parseFloat((basePrice + subTotal).toFixed(2));

    // Append sub_item names to the parent name for display
    const subNames = subItems.map((si) => si.name).filter(Boolean);
    const displayName = subNames.length > 0
      ? `${item.name} (${subNames.join(', ')})`
      : item.name;

    // Math invariant: unitPrice x qty should equal effectiveTotalPrice
    const expected = parseFloat((unitPrice * qty).toFixed(2));
    const mathBroken = !priceMissing &&
      Math.abs(expected - effectiveTotalPrice) > ROUNDING_TOLERANCE &&
      effectiveTotalPrice !== 0;

    const correctedUnitPrice = mathBroken
      ? parseFloat((effectiveTotalPrice / qty).toFixed(4))
      : unitPrice;

    return {
      id: item.id || generateId(),
      name: displayName,
      quantity: qty,
      unitPrice: correctedUnitPrice,
      totalPrice: effectiveTotalPrice,
      category: item.category || 'other',
      isEdited: false,
      hasExtras: subItems.some((si) => parsePrice(si.price) !== 0),
      // price_missing items get flagged so ⚠️ shows in ReviewScreen
      flagged: mathBroken || priceMissing,
    };
  });
}
```

**Step 5: Run tests to verify they PASS**

```bash
cd /c/Users/roeea/OneDrive/Documents/Github/ai-split-the-recipe && npx vitest run src/services/__tests__/receiptParser.test.ts 2>&1 | tail -15
```

Expected: 9 tests PASS.

**Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: clean.

**Step 7: Commit**

```bash
git add src/services/receiptParser.ts src/services/__tests__/receiptParser.test.ts
git commit -m "feat: add parsePrice helper, fix silent-zero bug, handle price_missing flag"
```

---

## Task 3: Add `setTranscript` to session hook

**Files:**
- Modify: `src/hooks/useSplitSession.ts`

**Step 1: Add `setTranscript` callback**

Inside `useSplitSession`, after `setServiceCharge`:

```typescript
const setTranscript = useCallback((transcript: string) => {
  setSession((s) => ({ ...s, lastTranscript: transcript }));
}, []);
```

**Step 2: Add `setTranscript` and `setReceiptItems` to the return object**

In the `return { ... }` block, add:

```typescript
setTranscript,
setReceiptItems: (items: ReceiptItem[]) =>
  setSession((s) => ({ ...s, receiptItems: items })),
```

(`setReceiptItems` is needed by the Magic Fix button in ReviewScreen to replace items after re-verify.)

**Step 3: Ensure `reset` clears `lastTranscript`**

The `reset` callback calls `setSession(DEFAULT_SESSION)` — since `DEFAULT_SESSION` now has `lastTranscript: null` (added in Task 1), this is already handled.

**Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: clean.

**Step 5: Commit**

```bash
git add src/hooks/useSplitSession.ts
git commit -m "feat: add setTranscript and setReceiptItems to session hook"
```

---

## Task 4: Update `geminiVision.ts`

**Files:**
- Modify: `src/services/geminiVision.ts`

This is the biggest task. Four sub-changes: improved prompts, `transcript` in `ScanResult`, and new `geminiReVerify` function.

**Step 1: Update `ScanResult` type to include `transcript`**

Change:
```typescript
export type ScanResult = {
  receipt: ParsedReceipt;
  tokens: ScanTokens;
};
```
To:
```typescript
export type ScanResult = {
  receipt: ParsedReceipt;
  tokens: ScanTokens;
  transcript: string;
};
```

**Step 2: Expose `transcript` from `scanReceipt`**

Change the return in `scanReceipt`:
```typescript
const tokens = calcScanCost(pass1Tokens, pass2Tokens);
return { receipt, tokens, transcript };
```

(The `transcript` variable already exists in scope from the `geminiOCR` destructure.)

**Step 3: Replace `OCR_PROMPT`**

```typescript
const OCR_PROMPT = `Act as a high-precision OCR engine. Your ONLY job is to transcribe this receipt image into raw text. Do NOT interpret, translate, or reformat anything.

Rules:
- Transcribe every line exactly as printed, including all characters
- Keep each item name and its price on the same line — preserve horizontal layout
- Preserve prefixes like -, +, or 'points' which indicate discounts or sub-items
- Preserve the original language and script (Hebrew, Arabic, Chinese, etc.) — do NOT translate
- Prices may appear as "25.90", "25,90", "₪25", "$12.50", "25.90₪" — transcribe exactly as printed
- If a price is partially obscured or unclear, transcribe what is readable and mark unclear digits with "?"
- Do NOT skip any line, even if it seems like a total or tax line

If the image quality prevents accurate reading, return ONLY one of these JSON objects:
{ "error": "BLURRY" }
{ "error": "CROPPED" }
{ "error": "LOW_LIGHT" }
{ "error": "OCCLUDED" }
{ "error": "NOT_A_RECEIPT" }

Otherwise return the raw transcript as plain text (no JSON, no markdown, no formatting).`;
```

**Step 4: Replace `STRUCTURE_PROMPT`**

```typescript
const STRUCTURE_PROMPT = `Below is a raw OCR transcript of a receipt. Convert it into a structured JSON object.

Item classification:
- MAIN: a chargeable item or dish with its own price
- SUB_ITEM: an extra, modifier, or discount that belongs to the MAIN above it (indented, starts with +/-)
- NOTE: a modifier with no price (e.g. "no gluten", "well done")
- RECEIPT_TOTAL / TAX / SERVICE: totals and charges — capture as top-level fields, NOT as items
- NOISE: ads, phone numbers, loyalty points text — ignore completely

Decimal and currency rules (CRITICAL for Israeli receipts):
- If you see a comma used as a decimal separator (e.g. "25,90"), convert to dot notation: 25.90
- Strip all currency symbols (₪, $, €, £, ¥) from numeric fields — output plain numbers only
- Thousands separators (e.g. "1,250.00") should become 1250.00

Discount rules:
- Discounts MUST appear as negative values inside sub_items, NOT as negative total_price on the MAIN item
- Example: item costs 50, discount of 10 → total_price: 50, sub_items: [{ name: "Discount", price: -10 }]

For each MAIN item, collect all following SUB_ITEM/NOTE lines into sub_items until the next MAIN.

Output JSON schema (respond with ONLY the JSON, no markdown):
{
  "receipt_type": "grocery" | "restaurant" | "gas" | "other",
  "restaurant_name": string | null,
  "currency": string (ISO 4217 code, e.g. "ILS", "USD"),
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
}

Rules:
- quantity defaults to 1 if not shown
- total_price = unit_price × quantity (before sub_items)
- If a price is unreadable or missing: set unit_price: null, total_price: null, price_missing: true
- confidence = "low" if data seems incomplete, ambiguous, or any price is missing
- If no items can be extracted: { "error": "NO_ITEMS_FOUND" }`;
```

**Step 5: Add `geminiReVerify` function**

Add this new exported function after `scanReceipt`:

```typescript
/**
 * Pass 3 — Re-verify: called only when the user clicks "Magic Fix".
 * Sends the stored OCR transcript (not the image) + mismatch context.
 * Returns corrected ReceiptItem[] or null if re-verify didn't help.
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

Return ONLY the corrected full JSON object using the exact same schema as before (same fields: receipt_type, restaurant_name, currency, subtotal, tax, service_charge, confidence, items). Do not explain, do not use markdown.`;

  const response = await fetch(GENERATE_URL, {
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
```

**Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any errors (likely `transcript` not in scope — check the `scanReceipt` destructuring).

**Step 7: Build check**

```bash
npm run build 2>&1 | tail -10
```

**Step 8: Commit**

```bash
git add src/services/geminiVision.ts
git commit -m "feat: improve OCR/structure prompts, add transcript to ScanResult, add geminiReVerify"
```

---

## Task 5: Wire transcript into HomeScreen

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

**Step 1: Destructure `setTranscript` from session**

In the `useSession()` destructure at the top of `HomeScreen`:

```typescript
const { setScreen, setReceiptData, scanError, setScanError, setTranscript } = useSession();
```

**Step 2: Store transcript after successful scan**

In `doScan()`, after `const { receipt, tokens, transcript } = await scanReceipt(blob, mimeType)`:

```typescript
setTranscript(transcript);
```

Add this line right after `setReceiptData(...)` and before `setScreen('review')`.

**Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat: store OCR transcript in session after scan (enables Magic Fix)"
```

---

## Task 6: Magic Fix button in ReviewScreen

**Files:**
- Modify: `src/screens/ReviewScreen.tsx`

**Step 1: Add imports**

```typescript
import { geminiReVerify } from '../services/geminiVision';
import { parseReceiptToItems } from '../services/receiptParser';
import { useState } from 'react'; // already imported, just ensure useState is there
import { monitoring } from '../monitoring';
```

**Step 2: Destructure new session values**

```typescript
const {
  session, setScreen, updateItem, deleteItem, addItem,
  setServiceCharge, setReceiptItems,
} = useSession();
const {
  receiptItems, currency, restaurantName, tax,
  serviceCharge, subtotal, scanConfidence, lastTranscript,
} = session;
```

**Step 3: Add Magic Fix state**

After existing `useState` declarations:

```typescript
const [magicFixLoading, setMagicFixLoading] = useState(false);
const [magicFixFailed, setMagicFixFailed] = useState(false);
```

**Step 4: Add `handleMagicFix` function**

```typescript
async function handleMagicFix() {
  if (!lastTranscript || !subtotal) return;
  setMagicFixLoading(true);
  setMagicFixFailed(false);

  const itemsSum = receiptItems.reduce((s, i) => s + i.totalPrice, 0);
  const corrected = await geminiReVerify(lastTranscript, itemsSum, subtotal);

  if (corrected) {
    const newItems = parseReceiptToItems(corrected);
    const newSum = newItems.reduce((s, i) => s + i.totalPrice, 0);
    const stillMismatched = Math.abs(newSum - subtotal) / subtotal > 0.05;

    if (stillMismatched) {
      setMagicFixFailed(true);
      monitoring.track('magic_fix_triggered', { success: false });
    } else {
      setReceiptItems(newItems);
      monitoring.track('magic_fix_triggered', { success: true });
    }
  } else {
    setMagicFixFailed(true);
    monitoring.track('magic_fix_triggered', { success: false });
  }

  setMagicFixLoading(false);
}
```

**Step 5: Replace the subtotal mismatch warning block**

Find the existing `subtotalWarning` warning block in the JSX. Replace it with:

```tsx
{subtotalWarning && (
  <motion.div
    initial={{ opacity: 0, y: -8 }}
    animate={{ opacity: 1, y: 0 }}
    className="mx-5 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl"
  >
    <div className="flex gap-2 items-start mb-2">
      <span className="text-lg flex-shrink-0">⚠️</span>
      <p className="text-xs text-amber-700 font-medium leading-snug">
        {magicFixFailed
          ? "Gemini couldn't resolve the difference — please check items manually."
          : subtotalWarning}
      </p>
    </div>
    {lastTranscript && subtotal && !magicFixFailed && (
      <button
        onClick={handleMagicFix}
        disabled={magicFixLoading}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-xl disabled:opacity-60"
      >
        {magicFixLoading ? (
          <>⏳ Asking Gemini…</>
        ) : (
          <>✨ Magic Fix</>
        )}
      </button>
    )}
  </motion.div>
)}
```

**Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any errors.

**Step 7: Build check**

```bash
npm run build 2>&1 | tail -10
```

**Step 8: Commit**

```bash
git add src/screens/ReviewScreen.tsx
git commit -m "feat: add Magic Fix button to ReviewScreen mismatch banner"
```

---

## Task 7: Add `magic_fix_triggered` monitoring event

**Files:**
- Modify: `src/monitoring/events.ts`

**Step 1: Add the event props interface**

Add to `events.ts`:

```typescript
export interface MagicFixTriggeredProps {
  success: boolean;
}
```

**Step 2: Add to `MonitoringEvent` union**

```typescript
export type MonitoringEvent =
  | 'scan_started'
  | 'scan_ocr_completed'
  | 'scan_completed'
  | 'scan_failed'
  | 'scan_retried'
  | 'item_manually_edited'
  | 'item_added_manually'
  | 'item_deleted'
  | 'screen_viewed'
  | 'split_completed'
  | 'summary_shared'
  | 'sign_in_completed'
  | 'sign_out'
  | 'paywall_shown'
  | 'paywall_converted'
  | 'magic_fix_triggered';   // ← ADD
```

**Step 3: Add to `EventProperties` map**

```typescript
magic_fix_triggered: MagicFixTriggeredProps;
```

**Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: clean.

**Step 5: Build + push**

```bash
npm run build 2>&1 | tail -10
git add src/monitoring/events.ts
git commit -m "feat: add magic_fix_triggered monitoring event"
git push
```
