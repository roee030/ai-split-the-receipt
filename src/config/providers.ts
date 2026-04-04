import type { ProviderName } from '../types/providers';

/**
 * Provider flags — switch AI models per pass via .env.local, no code changes needed.
 *
 * VITE_PASS1_PROVIDER  — vision OCR   (must support image input)
 * VITE_PASS2_PROVIDER  — text → JSON  (text-only, fast/cheap)
 * VITE_MAGIC_PROVIDER  — Magic Fix    (text-only, accuracy-focused)
 *
 * Valid values: 'gemini-2.0-flash' | 'gemini-2.5-flash' | 'gemini-1.5-pro' | 'claude-sonnet-4-5'
 * Default:      'gemini-2.0-flash' for all three passes
 */
export const PROVIDERS = {
  pass1: (import.meta.env.VITE_PASS1_PROVIDER ?? 'gemini-2.0-flash') as ProviderName,
  pass2: (import.meta.env.VITE_PASS2_PROVIDER ?? 'gemini-2.0-flash') as ProviderName,
  magic: (import.meta.env.VITE_MAGIC_PROVIDER ?? 'gemini-2.0-flash') as ProviderName,
} as const;
