/**
 * LLM Adapter Layer — orchestrator
 *
 * Three exported functions — one per pipeline pass.
 * Each switches on ProviderName and delegates to the correct adapter.
 * Adding a new provider = add a case in each switch + a new adapter file.
 */

import type { ParsedReceipt } from "../types/receipt.types";
import type { ProviderName } from "../types/providers";
import type { PassTokens } from "../monitoring/tokenCost";
import { STRUCTURE_PROMPT, MAGIC_FIX_PROMPT } from "./llm/prompts";
import {
  geminiTranscribe,
  geminiStructure,
  geminiMagicFix,
  geminiModelName,
} from "./llm/geminiAdapter";
import {
  claudeTranscribe,
  claudeStructure,
  claudeMagicFix,
} from "./llm/claudeAdapter";

// ─── Pass 1: transcribeImage ──────────────────────────────────────────────────

export async function transcribeImage(
  imageBase64: string,
  mimeType: string,
  provider: ProviderName,
): Promise<{ transcript: string; tokens: PassTokens }> {
  switch (provider) {
    case "gemini-3.1-flash-lite-preview":
    case "gemini-2.0-flash":
    case "gemini-2.5-flash":
    case "gemini-1.5-flash":
    case "gemini-2.0-flash-lite":
      return geminiTranscribe(imageBase64, mimeType, geminiModelName(provider));
    case "claude-sonnet-4-5":
      return claudeTranscribe(imageBase64, mimeType);
  }
}

// ─── Pass 2: structureTranscript ─────────────────────────────────────────────

export async function structureTranscript(
  transcript: string,
  provider: ProviderName,
): Promise<{ receipt: ParsedReceipt; tokens: PassTokens }> {
  const prompt = STRUCTURE_PROMPT.replace("{{TRANSCRIPT}}", transcript);

  switch (provider) {
    case "gemini-3.1-flash-lite-preview":
    case "gemini-2.0-flash":
    case "gemini-2.5-flash":
    case "gemini-1.5-flash":
    case "gemini-2.0-flash-lite":
      return geminiStructure(prompt, geminiModelName(provider));
    case "claude-sonnet-4-5":
      return claudeStructure(prompt);
  }
}

// ─── Pass 3: magicFix ────────────────────────────────────────────────────────

export async function magicFix(
  transcript: string,
  itemsSum: number,
  printedSubtotal: number,
  provider: ProviderName,
): Promise<ParsedReceipt | null> {
  const prompt = MAGIC_FIX_PROMPT.replace("{{TRANSCRIPT}}", transcript)
    .replace("{{ITEMS_SUM}}", itemsSum.toFixed(2))
    .replace("{{TOTAL}}", printedSubtotal.toFixed(2))
    .replace("{{DIFF}}", Math.abs(itemsSum - printedSubtotal).toFixed(2));

  try {
    switch (provider) {
      case "gemini-3.1-flash-lite-preview":
      case "gemini-2.0-flash":
      case "gemini-2.5-flash":
      case "gemini-1.5-flash":
      case "gemini-2.0-flash-lite":
        return geminiMagicFix(prompt, geminiModelName(provider));
      case "claude-sonnet-4-5":
        return claudeMagicFix(prompt);
    }
  } catch {
    return null;
  }
}
