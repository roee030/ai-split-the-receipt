/**
 * Claude (Anthropic) API adapter.
 * Handles all HTTP calls to the Anthropic Messages API.
 */

import type { ParsedReceipt } from '../../types/receipt.types';
import type { ProviderName } from '../../types/providers';
import type { PassTokens } from '../../monitoring/tokenCost';
import { TRANSCRIPT_PROMPT } from './prompts';
import { parseReceiptJSON, applyAutoCorrections } from './receiptJsonParser';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string;

// Dev  → Vite reverse-proxy at /api/anthropic  (vite.config.ts server.proxy, no CORS)
// Prod → Cloudflare Worker  (set VITE_ANTHROPIC_PROXY_URL=https://xxx.workers.dev)
export const ANTHROPIC_URL = import.meta.env.DEV
  ? '/api/anthropic/v1/messages'
  : `${import.meta.env.VITE_ANTHROPIC_PROXY_URL ?? ''}/v1/messages`;

export function anthropicModelName(provider: ProviderName): string {
  switch (provider) {
    case 'claude-sonnet-4-5':
    default: return 'claude-sonnet-4-5';
  }
}

// ─── Pass 1: transcribe ───────────────────────────────────────────────────────

export async function claudeTranscribe(
  imageBase64: string,
  mimeType: string,
): Promise<{ transcript: string; tokens: PassTokens }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: anthropicModelName('claude-sonnet-4-5'),
      max_tokens: 4096,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: TRANSCRIPT_PROMPT },
        ],
      }],
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('TOO_MANY_REQUESTS');
    throw new Error(`HTTP_${res.status}`);
  }

  const json = await res.json();
  const text = (json.content?.[0]?.text ?? '').trim();

  if (!text) throw new Error('EMPTY_RESPONSE');
  if (text.startsWith('NOT_A_RECEIPT')) throw new Error('NOT_A_RECEIPT');
  if (text.startsWith('BLURRY'))        throw new Error('BLURRY');

  const words    = text.split(/\s+/);
  const unknowns = words.filter((w: string) => w === '[?]').length;
  if (unknowns / words.length > 0.5) throw new Error('BLURRY');

  return {
    transcript: text,
    tokens: {
      inputTokens:  json.usage?.input_tokens  ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    },
  };
}

// ─── Pass 2: structure ────────────────────────────────────────────────────────

export async function claudeStructure(
  prompt: string,
): Promise<{ receipt: ParsedReceipt; tokens: PassTokens }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: anthropicModelName('claude-sonnet-4-5'),
      max_tokens: 8192,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('TOO_MANY_REQUESTS');
    throw new Error(`HTTP_${res.status}`);
  }

  const json = await res.json();
  const text = (json.content?.[0]?.text ?? '').trim();
  if (!text) throw new Error('EMPTY_RESPONSE');

  return {
    receipt: applyAutoCorrections(parseReceiptJSON(text)),
    tokens: {
      inputTokens:  json.usage?.input_tokens  ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    },
  };
}

// ─── Pass 3: magic fix ────────────────────────────────────────────────────────

export async function claudeMagicFix(
  prompt: string,
): Promise<ParsedReceipt | null> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: anthropicModelName('claude-sonnet-4-5'),
      max_tokens: 8192,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const text = (json.content?.[0]?.text ?? '').trim();
  const p = JSON.parse(text);
  return p.error ? null : applyAutoCorrections(p as ParsedReceipt);
}
