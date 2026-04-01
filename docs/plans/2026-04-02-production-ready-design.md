# SplitSnap Production-Ready Design

**Date:** 2026-04-02
**Scope:** Two-pass AI prompt, i18n + RTL/LTR, dark/light mode, WCAG 2.1 AA accessibility, legal compliance, scan security

---

## 1. Two-Pass AI Prompt

### Problem
Single-pass OCR + structuring fails on blurry images, cropped receipts, low-light photos, and non-Latin scripts (Hebrew, Arabic, Chinese). The model tries to read and structure simultaneously — when reading fails, everything fails.

### Solution: Two Sequential Gemini Calls

**Pass 1 — OCR + Quality Check**

```
Act as a high-precision OCR engine. Your goal is to transcribe this receipt image into raw text.

- List every line exactly as printed
- Keep item and price on the same line (preserve horizontal relationships)
- Preserve prefixes like -, +, or 'points' which indicate discounts or sub-items
- Preserve the original language and script (Hebrew, Arabic, Chinese, etc.)

If the image quality prevents accurate reading, return one of:
{ "error": "BLURRY" }
{ "error": "CROPPED" }
{ "error": "LOW_LIGHT" }
{ "error": "OCCLUDED" }
{ "error": "NOT_A_RECEIPT" }

Otherwise return the raw transcript as plain text.
```

**Pass 2 — Structuring** (only runs if Pass 1 returns plain text)

```
Below is a raw text transcript of a receipt. Convert it into a JSON object.

Rules:
- Item Types: Distinguish between physical products, services, and discounts (negative prices)
- Hierarchy: If a line appears to be a modifier of the previous line (e.g. 'Extra Cheese'
  under 'Pizza', or a discount under a product), nest it as a sub_item
- Quantities: Extract qty and unit_price. If not specified, default qty to 1
- Classify every line as: MAIN, SUB_ITEM, NOTE, RECEIPT_TOTAL, TAX, SERVICE, or NOISE
- receipt_type: "grocery" | "restaurant" | "gas" | "other"

Output JSON schema (respond with ONLY the JSON, no markdown):

{
  "receipt_type": "grocery" | "restaurant" | "gas" | "other",
  "restaurant_name": string | null,
  "currency": string (ISO 4217),
  "subtotal": number | null,
  "tax": number | null,
  "service_charge": number | null,
  "confidence": "high" | "medium" | "low",
  "items": [
    {
      "name": string,
      "quantity": number,
      "unit_price": number,
      "total_price": number,
      "sub_items": [{ "name": string, "price": number }]
    }
  ]
}

Rules:
- All prices as positive numbers (discounts are negative sub_items)
- total_price = unit_price × quantity (before sub_items)
- If no items can be extracted, return { "error": "NO_ITEMS_FOUND" }
```

### Error Codes → User-Facing Messages (i18n keys)

| AI returns | i18n key | English message |
|---|---|---|
| `BLURRY` | `errors.BLURRY` | "The photo came out a bit blurry. Try holding the phone steadier and shoot again." |
| `CROPPED` | `errors.CROPPED` | "Part of the receipt looks cut off. Make sure all edges (especially the price at the bottom) are in frame." |
| `LOW_LIGHT` | `errors.LOW_LIGHT` | "It's too dark here. Try turning on a light or using flash." |
| `OCCLUDED` | `errors.OCCLUDED` | "Something is covering the text (maybe a finger?). Try shooting again with the receipt fully exposed." |
| `NOT_A_RECEIPT` | `errors.NOT_A_RECEIPT` | "We couldn't identify a receipt here. Make sure you're photographing a clear bill or receipt." |
| `NO_ITEMS_FOUND` | `errors.NO_ITEMS_FOUND` | "We couldn't find any items. Try a better-lit photo." |
| `RATE_LIMITED` | `errors.RATE_LIMITED` | "Please wait a moment before scanning again." |

### Cost
~$0.0008/scan (2× single-pass). At $0.99/month with 30 scans/month = 0.8% of revenue.

---

## 2. i18n + RTL/LTR

### Library
`react-i18next` + `i18next` — industry standard, Vite-compatible, handles RTL direction.

### Languages (launch set)
| Code | Language | Direction |
|---|---|---|
| `en` | English | LTR |
| `he` | Hebrew | RTL |
| `ar` | Arabic | RTL |
| `es` | Spanish | LTR |
| `fr` | French | LTR |
| `pt` | Portuguese | LTR |
| `ru` | Russian | LTR |

### File Structure
```
src/
  locales/
    en/translation.json
    he/translation.json
    ar/translation.json
    es/translation.json
    fr/translation.json
    pt/translation.json
    ru/translation.json
  i18n.ts   ← initialises i18next, detects language
```

### RTL Handling
- `<html dir="rtl" lang="he">` set dynamically when language is he/ar
- Tailwind `rtl:` variant used for directional classes (margins, paddings, flex, text alignment)
- Framer Motion animations respect direction (slide-in from correct side)

### Language Detection Order
1. `localStorage` saved choice (user override)
2. Browser `navigator.language`
3. Fallback: English

### Language Switcher
Globe icon (🌐) in app header → bottom sheet with list of 7 languages. Selection saved to `localStorage` and applied immediately (no page reload).

---

## 3. Dark Mode + Accessibility

### Dark/Light Mode

**Implementation:** Tailwind `dark:` class variant on `<html>`. One class flip switches the entire app.

**Activation:**
- On load: check `localStorage` for saved preference → else use `prefers-color-scheme`
- Toggle button (sun/moon icon) in header → saves to `localStorage`

**Color Tokens:**

| Token | Light | Dark | Contrast ratio |
|---|---|---|---|
| Background | `#F7F6F3` | `#1A1A1A` | — |
| Surface | `#FFFFFF` | `#2A2A2A` | — |
| Primary text | `#1A1A1A` | `#F0F0F0` | 16:1 / 12:1 ✅ |
| Muted text | `#6B7280` | `#9CA3AF` | 4.6:1 / 4.7:1 ✅ |
| Accent orange | `#F97316` | `#FB923C` | 4.5:1 on bg ✅ |
| Border | `#E5E7EB` | `#3A3A3A` | — |
| Error red | `#EF4444` | `#F87171` | 4.5:1 ✅ |

### Accessibility (WCAG 2.1 AA)

**Touch targets:** All buttons, chips, and interactive elements minimum 44×44px.

**Focus management:**
- All modals trap focus (Tab cycles within modal, Escape closes)
- Focus returns to trigger element when modal closes

**Screen readers:**
- All icon-only buttons have `aria-label`
- All images have `alt` text
- Loading states announce via `aria-live="polite"`
- Error messages in `role="alert"`

**Heading hierarchy:** Never skip levels (h1 → h2 → h3 throughout each screen).

**Color independence:** Every status indicator uses icon + color (never color alone).

**Motion:** `prefers-reduced-motion` media query disables all Framer Motion animations when set.

**Semantic HTML:** `<button>` for actions, `<nav>` for navigation, `<main>` for content, `<header>` for headers.

---

## 4. Legal Requirements

### In-App Pages
| Page | Route | Required by |
|---|---|---|
| Privacy Policy | `/privacy` | App Store, Google Play, GDPR, CCPA |
| Terms of Service | `/terms` | App Store, Google Play |
| Cookie/Data consent | First-launch banner | GDPR |

Both pages linked from:
- Sign-in modal footer ("By continuing you agree to our Terms and Privacy Policy")
- Settings screen → "Legal" section

### GDPR (EU)
- **Consent banner** on first launch: "We use Firebase to store your scan history and account data. This is required for the app to work."
- **Data deletion:** Settings → "Delete my account & data" → deletes `users/{uid}` Firestore document + all subcollections + Firebase Auth account
- **No ad tracking:** No third-party analytics beyond Firebase (declared in Privacy Policy)

### CCPA (California)
- Settings → Legal → "We do not sell your personal information" (static statement — sufficient since no data is sold)

### App Store Disclosures
**Apple Privacy Nutrition Label** (declare in App Store Connect):
- Name — collected, linked to identity
- Email address — collected, linked to identity
- User ID — collected, linked to identity
- Usage data (scan count) — collected, linked to identity

**Google Play Data Safety:**
- Same declarations as above
- Data encrypted in transit: yes (Firebase default)
- Data deletion: yes (in-app option)

### Policy Content
- Written in plain English (not legal jargon)
- Translated into all 7 languages via i18n system
- Hosted in-app (no external URL dependency)

---

## 5. Security — Scan Limit & Rate Limiting

### Problem A: Account Switching Bypass
User creates a second Google/email account to get 5 more free scans.

### Solution: Device Fingerprint
On first app load, generate a stable device ID from browser signals:
- Screen resolution + color depth
- Timezone
- Browser language list
- Canvas fingerprint (renders a hidden canvas, hashes the pixel data)
- Stored in `localStorage` + `IndexedDB` (both must be cleared to reset)

This device ID is sent with every scan request. The Cloud Function tracks `scansUsed` per device ID in Firestore (`deviceScans/{deviceId}`), separate from per-account tracking. New account + same device = device quota already consumed.

**Limitation:** Determined users can clear browser storage. Stops ~95% of casual abuse.

### Problem B: Rapid Scanning Abuse

**Client-side:** Scan button disabled for 10 seconds after each attempt (success or failure). Visual countdown timer shown.

**Server-side:** Cloud Function reads `lastScanAt` timestamp from `users/{uid}`. If less than 30 seconds ago → return `RATE_LIMITED` error. This enforces the limit even if someone bypasses the UI.

### Full Security Stack

| Layer | Mechanism | Stops |
|---|---|---|
| 1 | Firebase Auth required | Anonymous API abuse |
| 2 | 5 scans per account (Firestore) | Casual freeloaders |
| 3 | Device fingerprint (Firestore) | Account switching |
| 4 | 30s server-side cooldown | API hammering |
| 5 | 10s client-side button disable | Accidental double-taps |
| 6 | Firebase App Check (future) | Scripted/bot abuse |

---

## Build Order

1. **Revert to client-side scanning** — remove Cloud Function dependency until billing is enabled
2. **Two-pass prompt** — update `geminiVision.ts` with Pass 1 + Pass 2 + new error codes
3. **i18n setup** — install react-i18next, create translation files for all 7 languages, wire up language detection
4. **RTL/LTR** — dynamic `dir` attribute, Tailwind RTL variants throughout
5. **Dark mode** — CSS tokens, Tailwind dark: variants, toggle button
6. **Accessibility audit** — touch targets, ARIA labels, focus trapping, reduced motion
7. **Legal pages** — Privacy Policy + Terms of Service in-app, consent banner, data deletion
8. **Device fingerprint** — generate/store device ID, send with scan, Cloud Function checks
9. **Rate limiting** — client-side cooldown button, server-side 30s check
10. **App icons** — generate proper 192px and 512px icons for PWA + App Store
