/**
 * OCR Correction Dictionary
 *
 * When a user manually fixes a wrong item name in ReviewScreen, we save the
 * mapping  ocrText → correctedText  keyed by restaurant.  On the next scan of
 * the same restaurant every item name is automatically replaced before display.
 *
 * Storage: localStorage as JSON (client-only, no backend needed).
 */

const STORAGE_KEY = 'splitsnap_ocr_corrections_v1';

/** restaurantKey → { ocrText: correctedText } */
type DictionaryStore = Record<string, Record<string, string>>;

function load(): DictionaryStore {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function save(store: DictionaryStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or unavailable — silently skip
  }
}

/** Normalise restaurant name to a stable key */
function key(restaurantName: string): string {
  return restaurantName.trim().toLowerCase();
}

/**
 * Save a correction: for this restaurant, "ocrText" should be displayed as
 * "correctedText" on future scans.
 * If ocrText === correctedText (no change), the entry is removed.
 */
export function saveCorrection(
  restaurantName: string,
  ocrText: string,
  correctedText: string,
): void {
  if (!restaurantName || !ocrText) return;
  const store = load();
  const rKey = key(restaurantName);
  if (!store[rKey]) store[rKey] = {};

  if (ocrText === correctedText) {
    // User reverted to original — remove the entry
    delete store[rKey][ocrText];
  } else {
    store[rKey][ocrText] = correctedText;
  }
  save(store);
}

/**
 * Return the correction dictionary for a restaurant:
 * { "מיצב תפוזים": "קוקה קולה", ... }
 */
export function getCorrections(restaurantName: string | null): Record<string, string> {
  if (!restaurantName) return {};
  const store = load();
  return store[key(restaurantName)] ?? {};
}

/**
 * Apply all saved corrections to a list of item names.
 * Returns the corrected name, or the original if no correction exists.
 */
export function applyCorrection(
  restaurantName: string | null,
  ocrName: string,
): string {
  if (!restaurantName) return ocrName;
  const corrections = getCorrections(restaurantName);
  return corrections[ocrName] ?? ocrName;
}

/** Remove all corrections for a specific restaurant, or everything. */
export function clearCorrections(restaurantName?: string): void {
  if (!restaurantName) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const store = load();
  delete store[key(restaurantName)];
  save(store);
}

/** How many corrections are stored across all restaurants. */
export function correctionCount(): number {
  const store = load();
  return Object.values(store).reduce((n, r) => n + Object.keys(r).length, 0);
}

// ─── Levenshtein helpers ───────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

/** Returns 0–1 similarity (1 = identical). */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ─── trackManualCorrection ────────────────────────────────────────────────────

/**
 * Called when the user edits an item name in ReviewScreen.
 * - In development: logs a JSON snippet to the console for copy-paste into golden files.
 * - In production: saves to localStorage via saveCorrection (always).
 */
export function trackManualCorrection(
  ocrText: string,
  correctedText: string,
  restaurantName: string,
): void {
  // Always persist to localStorage for live correction on future scans
  saveCorrection(restaurantName, ocrText, correctedText);

  // Dev-only: log a snippet useful for updating golden files / autoLearnedCorrections.json
  if (import.meta.env.DEV && ocrText !== correctedText) {
    console.log(
      `%c[OCR correction]%c "${ocrText}" → "${correctedText}"  (restaurant: "${restaurantName}")\n` +
      `Copy to golden file:  "corrections": { ${JSON.stringify(ocrText)}: ${JSON.stringify(correctedText)} }`,
      'color: #f59e0b; font-weight: bold',
      'color: inherit',
    );
  }
}

// ─── applyFuzzyCorrection ─────────────────────────────────────────────────────

const FUZZY_THRESHOLD = 0.95; // 95% similarity required for auto-apply

/**
 * Like `applyCorrection`, but also tries a fuzzy (Levenshtein) match against
 * all known OCR keys for the restaurant when no exact key is found.
 *
 * Returns `{ name, fuzzyMatch }` where `fuzzyMatch` is true if a fuzzy
 * (non-exact) correction was applied — used to set a "Low Confidence" flag.
 */
export function applyFuzzyCorrection(
  restaurantName: string | null,
  ocrName: string,
): { name: string; fuzzyMatch: boolean } {
  if (!restaurantName) return { name: ocrName, fuzzyMatch: false };

  const corrections = getCorrections(restaurantName);

  // Exact match — no uncertainty
  if (corrections[ocrName] !== undefined) {
    return { name: corrections[ocrName], fuzzyMatch: false };
  }

  // Fuzzy match — scan all known OCR keys for this restaurant
  let bestKey    = '';
  let bestScore  = 0;
  for (const knownOcr of Object.keys(corrections)) {
    const score = similarity(ocrName, knownOcr);
    if (score > bestScore) {
      bestScore = score;
      bestKey   = knownOcr;
    }
  }

  if (bestScore >= FUZZY_THRESHOLD && bestKey) {
    return { name: corrections[bestKey], fuzzyMatch: true };
  }

  return { name: ocrName, fuzzyMatch: false };
}
