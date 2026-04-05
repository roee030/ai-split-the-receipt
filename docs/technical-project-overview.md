# Split — Technical Project Overview

> **Intended audience:** Senior stakeholders, engineering leadership, product partners.
> **Purpose:** High-level architecture review and engineering rationale for the Split receipt-parsing platform.

---

## 1. Executive Summary

**Split** is a high-precision, mobile-first financial tool that solves one of the most friction-heavy moments in social dining: splitting a restaurant bill fairly, accurately, and instantly.

The Israeli restaurant market presents a uniquely difficult OCR challenge. Receipts are printed on low-contrast thermal paper using compressed Hebrew fonts, right-to-left text flow, and POS layouts (such as Tabit) where prices appear on the *left* of the item name — the opposite of Western convention. A single misread character in Hebrew can silently corrupt a financial transaction: **ב** (Bet) and **כ** (Kaf) are visually near-identical at small point sizes, yet they produce completely different words and completely different bills.

Standard, single-pass AI vision approaches fail here for a structural reason: language models are trained to *understand* text, which means they unconsciously *correct* what they see. A model that knows food will read a blurry glyph cluster and confidently output "סשימי דג" (Sashimi Fish) even when the receipt clearly printed something different — then charge someone for a dish they didn't order. This is not a hallucination problem in the traditional sense. It is the model being *too intelligent* for the task.

Split's engineering mandate was to build a pipeline that separates pixel-level accuracy from linguistic intelligence — and then reunite them safely.

---

## 2. The Vision Pipeline — Triple-Pass Architecture

The core architectural breakthrough is a strict three-pass pipeline. Each pass has a single, well-defined contract. No pass can influence the *names* output by the pass before it.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RECEIPT IMAGE                                │
│                      (JPEG / PNG / HEIC)                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │   PASS 1 — VISUAL GROUNDING  │
              │   Model: Gemini 2.0 Flash     │
              │   Input:  Raw image pixels    │
              │   Output: Plain-text transcript│
              │   Thinking: DISABLED          │
              │   Food knowledge: SUPPRESSED  │
              └──────────────┬───────────────┘
                             │  Plain text (no JSON, no structure)
                             ▼
              ┌──────────────────────────────┐
              │   PASS 2 — STRUCTURAL LOGIC  │
              │   Model: Gemini 2.0 Flash     │
              │   Input:  Text transcript     │
              │   Output: Structured JSON     │
              │   No image — no visual bias   │
              └──────────────┬───────────────┘
                             │  Receipt JSON
                             ▼
              ┌──────────────────────────────┐
              │  PASS 3 — SELF-HEALING MATH  │
              │   Triggered: on sum mismatch  │
              │   Input:  JSON + transcript   │
              │   Output: Corrected JSON      │
              │   Scope: Numbers only         │
              └──────────────┬───────────────┘
                             │
                             ▼
                     VERIFIED RECEIPT
```

### Pass 1 — Visual Grounding ("The Brainless OCR Engine")

**The problem we were solving:** When a single-pass model receives a receipt image and is asked to return JSON, it performs vision and language understanding simultaneously. This conflation causes it to substitute unclear glyphs with contextually plausible food words. The model's linguistic prior overrides its visual observation.

**The solution:** Pass 1 is deliberately *lobotomised*. The prompt instructs the model to behave as a low-level OCR engine with four hard rules:

1. **Do not fix text.** If a character cluster looks wrong, output it wrong.
2. **Do not complete words.** "לימונ" must stay "לימונ" — never "לימונדה".
3. **Character accuracy over meaning.** A visually correct but semantically nonsensical output is a *success*.
4. **No normalisation.** Preserve spacing, punctuation, and symbols exactly as printed.

Critically, we **disabled the model's thinking budget** (`thinkingBudget: 0`). Enabling chain-of-thought reasoning causes the model to *reason about* what a blurry character *should* be — which is precisely the failure mode we are eliminating. Thinking is powerful for logic tasks; it is catastrophic for raw transcription.

The output of Pass 1 is a flat, line-by-line text transcript. It contains no JSON, no structure, no interpretation — just the characters visible on the receipt, in order.

### Pass 2 — Structural Logic ("The Blind Parser")

**The problem we were solving:** We needed to extract structured data (item names, quantities, prices) without re-introducing visual hallucination.

**The solution:** Pass 2 receives *only the text transcript* from Pass 1. It never sees the image. Its entire mandate is to parse numbers and copy names — verbatim, character-for-character — from the transcript it received. The model is explicitly told: "The transcript is the source of truth. You cannot change, fix, translate, or improve any name."

This separation is the architectural keystone. Because Pass 2 has no image to look at, it cannot second-guess the transcription. If Pass 1 output "ג'ימזונה", Pass 2 outputs `"name": "ג'ימזונה"` — and the correction layer downstream handles the disambiguation, not the vision model.

Pass 2 also handles the Tabit POS layout quirk: prices appear on the *left* of the line, quantities and names on the right (`98.00  1 קבב טלה`). The prompt encodes this layout explicitly, allowing correct parsing without visual context.

### Pass 3 — Self-Healing Math ("The Reconciliation Layer")

**The problem we were solving:** Even a perfect OCR pipeline can misread a price — a decimal comma vs. a decimal point, a merged line, a skipped row. Financial tools cannot ship with silent arithmetic errors.

**The solution:** After Pass 2, the system computes the sum of all parsed item prices and compares it against the receipt's printed subtotal. If the delta exceeds 5%, Pass 3 activates automatically.

Pass 3 receives the original transcript (as an anchor) and the current JSON. Its mandate is narrow: **fix numbers only**. Item names are explicitly frozen — "Every `name` must be copied verbatim from the TRANSCRIPT." This prevents the reconciliation layer from accidentally re-introducing the name-substitution problem that Pass 1 and Pass 2 were designed to eliminate.

The result is financial integrity guaranteed by architecture, not by prompt cleverness.

---

## 3. Engineering Breakthroughs

### Image Preprocessing — Preserving Hebrew Anti-Aliasing

Hebrew characters at thermal-print resolution contain critical information in their *anti-aliased edges*. Aggressive binarisation (black/white thresholding) — the standard OCR preprocessing step — destroys precisely the sub-pixel detail that distinguishes visually similar Hebrew letters.

Early iterations of Split applied a binarisation filter before sending the image to Gemini. Benchmark testing revealed a counter-intuitive result: the raw, unprocessed image consistently outperformed the binarised image. The model's internal vision preprocessing is superior to our canvas-level pixel manipulation.

The final strategy:
- **No binarisation.** Send the raw image as captured.
- **Max resolution: 3000px** on the long side. This preserves the anti-aliased glyph details that differentiate **ב** from **כ**.
- **Lossless PNG output** from the resize step. JPEG re-compression at this scale reintroduces artefacts on character edges.
- **No contrast adjustment.** A contrast boost of ×1.2 improved some characters while regressing others (קוקה קולה → קרוה קולה in testing). Net effect: zero.

The principle: *trust the model's vision; control the resolution*.

### Contextual Anchoring — Using Prices as Visual Row Locks

In the Tabit POS layout, the price printed to the far left of each row acts as a natural anchor point. Because prices are numerically unambiguous, the model can use them to validate row boundaries — preventing multi-line items from merging or single items from splitting across rows.

The structure prompt makes this anchoring explicit, training the parser to treat `price  qty  name` as a locked triple. This eliminated an entire class of row-merging errors that appeared in early single-pass attempts.

---

## 4. The Learning Layer — Contextual Corrections

No OCR system achieves 100% accuracy on every receipt variant. The honest engineering answer is not to chase a perfect model — it is to build a system that *gets better with use*.

Split implements a two-tier correction architecture:

### Tier 1 — Auto-Learned Corrections (Build-Time)

A regression test suite (`npm run regression`) runs the full pipeline against a library of real receipts with verified golden files. When a mismatch is detected and a correction is provided in the golden file, the `--apply-corrections` flag writes the mapping to `src/data/autoLearnedCorrections.json`.

This file is bundled into the application at build time by Vite. On every receipt parse, the adapter layer applies these corrections automatically — global mappings first, then restaurant-specific overrides. The correction lookup is O(1) and adds zero latency to the pipeline.

### Tier 2 — User-Driven Corrections (Runtime, Personalised)

When a user manually edits an item name in the Review screen, `trackManualCorrection()` is called:

- **In development:** Logs a structured JSON snippet to the console — `"שטיחי דג" → "סשימי דג"` — so corrections can be promoted to the golden file library.
- **In production:** Persists the mapping to `localStorage` under a restaurant-keyed namespace.

On subsequent scans of the same restaurant, `applyFuzzyCorrection()` applies these user corrections before display. The fuzzy fallback uses a Levenshtein distance threshold of **95% similarity** — meaning if the OCR outputs a slightly different rendering of a previously-corrected name (e.g., different vowel mark, trailing space), the correction still fires, with a low-confidence flag surfaced to the user.

**The net effect:** The first scan of a restaurant may have 2–3 wrong names. By the third scan, the system has learned every menu item at that restaurant and achieves 100% personalised accuracy — without any backend, without any ML retraining, and without storing user data remotely.

---

## 5. Tech Stack

| Layer | Technology | Role |
|---|---|---|
| **Frontend** | React 19, TypeScript, Vite | PWA shell, review UI, session management |
| **Styling** | Tailwind CSS, Framer Motion | Responsive layout, animated transitions |
| **Vision AI (Pass 1)** | Google Gemini 2.0 Flash | Image-to-text OCR transcription |
| **Structure AI (Pass 2)** | Google Gemini 2.0 Flash | Text-to-JSON parsing |
| **Reconciliation (Pass 3)** | Google Gemini 2.0 Flash | Math self-healing |
| **Alternative Provider** | Anthropic Claude (Sonnet) | Drop-in provider swap via env flag |
| **Mobile** | Capacitor (iOS + Android) | Native app wrapper for PWA |
| **Backend / Auth** | Firebase | Authentication, future cloud sync |
| **Testing** | Vitest, Regression Suite (tsx) | Unit tests + golden-file OCR benchmarks |
| **Correction Store** | localStorage + bundled JSON | Zero-latency, zero-backend learning layer |

### Provider Flexibility

All three pipeline passes are abstracted behind a `ProviderName` type and a provider config object. Switching from Gemini 2.0 Flash to Gemini 2.5 Flash, Gemini 1.5 Pro, or Claude Sonnet for any individual pass requires a single environment variable change — no code modification. This was a deliberate architectural decision to enable systematic A/B testing of models against the regression benchmark suite.

```
VITE_PASS1_PROVIDER=gemini-2.0-flash
VITE_PASS2_PROVIDER=gemini-2.0-flash
VITE_MAGIC_PROVIDER=gemini-2.0-flash
```

---

## 6. Quality Assurance — The Regression Suite

Split ships with a full OCR regression framework (`tests/scripts/regression.ts`) built specifically for this problem domain.

**How it works:**

1. Drop a receipt image and a `.expected.json` golden file into `tests/receipts/`
2. Run `npm run regression` — the suite executes the full two-pass pipeline against every receipt
3. Each item name is scored using **Levenshtein similarity** (0–100%). Items scoring ≥ 90% are marked as passing
4. An overall accuracy score is reported per receipt and in aggregate

**Threshold Benchmarking** (`npm run regression:bench`) runs every receipt at three contrast multipliers (×0.8, ×1.0, ×1.2) to empirically verify that preprocessing changes do not cause regressions — the finding that eliminated the binarisation filter.

**The Learning Engine** (`npm run regression:learn`) automatically promotes failures into `autoLearnedCorrections.json`, scoped by restaurant name. This closes the feedback loop between QA and production.

---

## 7. Future Scalability

### Magic Fix — Autonomous Error Recovery

Pass 3 (Self-Healing Math) is already operational. Its design anticipates expansion: the reconciliation prompt can be extended to detect common POS-specific formatting anomalies (e.g., service charge split across multiple rows in the Tabit system) and correct them without human intervention.

### Multi-POS Layout Support

The structure prompt currently encodes the Tabit layout (`price  qty  name`). The adapter architecture supports injecting a layout hint per restaurant — derived from the correction dictionary's restaurant key. As Split accumulates restaurant data, per-chain layout profiles can be applied automatically, extending accurate parsing to any POS system in the Israeli market without model retraining.

### Cloud Sync of Corrections

The correction dictionary is currently `localStorage`-only — a deliberate choice to ship fast and keep user data private. The `DictionaryStore` format (`{ restaurantKey: { ocrText: correct } }`) is JSON-serialisable and Firebase-ready. Promoting corrections to a cloud store requires wiring the existing `save()` / `load()` functions to Firestore — no schema change required.

### Expansion Beyond Israeli Market

The pipeline architecture is language-agnostic. Pass 1's hard rules make no assumptions about writing direction, script, or language. Supporting Arabic receipts, for example, requires only a new golden-file test corpus and updated layout hints in the structure prompt — the three-pass pipeline requires no modification.

---

## Appendix — Key Engineering Decisions Log

| Decision | Alternative Considered | Why We Chose This |
|---|---|---|
| Two-pass (vision + structure) | Single-pass image→JSON | Eliminates hallucination at the architectural level |
| Disable thinking (`thinkingBudget: 0`) | Enable reasoning | Thinking caused semantic over-correction on character ambiguity |
| No image preprocessing | Binarisation / contrast boost | Benchmark showed preprocessing regressed net accuracy |
| 3000px max resolution | 2048px | Sub-pixel Hebrew glyph detail requires higher resolution |
| Lossless PNG output | JPEG | JPEG artefacts on character edges at resize boundary |
| Levenshtein 95% fuzzy threshold | Exact match only | Handles minor OCR variants of the same correction key |
| localStorage for corrections | Backend API | Zero latency, zero infrastructure, privacy-preserving |
| Per-restaurant correction scope | Global dictionary | Prevents cross-restaurant false positives (same OCR error, different correct name) |
| `gemini-2.0-flash` (1,500 req/day free) | `gemini-2.5-flash` (20 req/day free) | Rate limit fit for development and beta testing |
| 1.5s inter-pass delay | No delay | Prevents RPM (requests-per-minute) quota errors on back-to-back API calls |

---

*Document version: 2026-04-04 — Split Engineering*
