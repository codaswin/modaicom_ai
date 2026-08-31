// Phase 6 — persistence for Response Controls (ADR-0009).
//
// chrome.storage.local, key `modaicom.generation.preferences`, storing the id
// triple only. NOT chrome.storage.sync (no reason to replicate a UI preference
// to Google infrastructure); not session-only; not reset on popup close.
//
// Reads validate and fall back to DEFAULT_GENERATION_PREFERENCES — a corrupt or
// stale local value is a bug or a version migration, not an attack, and the
// fallback guarantees preferencesToInstructions never receives an unknown id.
// (A runtime-message boundary, added in Phase 7, must instead reject with a
// typed error.)

import {
  DEFAULT_GENERATION_PREFERENCES,
  isGenerationPreferences,
  type GenerationPreferences,
} from '../features/generation/preferences'

const STORAGE_KEY = 'modaicom.generation.preferences'

export async function readPreferences(): Promise<GenerationPreferences> {
  try {
    const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]
    return isGenerationPreferences(stored) ? stored : DEFAULT_GENERATION_PREFERENCES
  } catch {
    return DEFAULT_GENERATION_PREFERENCES
  }
}

export async function writePreferences(prefs: GenerationPreferences): Promise<void> {
  // Persist the id triple only — never spread `prefs`, which could carry extra
  // keys past the type at a call site.
  const record: GenerationPreferences = {
    tone: prefs.tone,
    intent: prefs.intent,
    length: prefs.length,
  }
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: record })
  } catch {
    // storage unavailable (private mode, quota) — the in-memory selection still
    // works for this popup session.
  }
}
