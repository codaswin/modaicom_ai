// Phase 6 — Response Controls (ADR-0009). Three curated, typed choices the user
// makes before a draft is generated: Tone (how it sounds), Intent (what the
// comment is for), Response Length (how long).
//
// This module is pure: no `chrome.*`, no DOM, no import from `content/` or
// `providers/`. The LinkedIn adapter and the AI provider layer never learn this
// vocabulary. The only value stored, validated, messaged, or mapped is the `id`;
// `label` is presentation-only and `instruction` is consumed solely inside the
// generation layer.
//
// Phase 6 does not wire these instructions into a generation request — that is
// Phase 7, which owns how the instruction list renders into a Generation Input.

export const TONES = [
  {
    id: 'professional',
    label: 'Professional',
    instruction: 'Write in a professional, polished tone. Avoid slang and exclamation marks.',
  },
  {
    id: 'friendly',
    label: 'Friendly',
    instruction: 'Write in a warm, approachable tone. Be personable without being casual or effusive.',
  },
  {
    id: 'confident',
    label: 'Confident',
    instruction: 'Write in a direct, assured tone. State the point plainly, without hedging or filler qualifiers.',
  },
  {
    id: 'thoughtful',
    label: 'Thoughtful',
    instruction: 'Write in a measured, reflective tone. Acknowledge nuance and show considered reasoning.',
  },
] as const

// One universal Intent set for v1 — identical for a Post-Comment Interaction and
// a Comment-Reply Interaction.
export const INTENTS = [
  {
    id: 'support',
    label: 'Support',
    instruction: "Agree with and reinforce the author's point, adding a brief reason or example.",
  },
  {
    id: 'add-insight',
    label: 'Add insight',
    instruction: 'Contribute one additional perspective or fact that builds on the post rather than restating it.',
  },
  {
    id: 'ask-question',
    label: 'Ask a question',
    instruction: 'Ask one genuine, specific question that invites the author to expand on their point.',
  },
  {
    id: 'answer',
    label: 'Answer',
    instruction: 'Directly and concisely answer the question raised in what you are responding to.',
  },
  {
    id: 'disagree',
    label: 'Disagree',
    instruction: 'Respectfully offer a different view, naming the specific point of disagreement and why.',
  },
  {
    id: 'congratulate',
    label: 'Congratulate',
    instruction: 'Give a brief, sincere note of congratulations suited to the achievement described.',
  },
] as const

// `approxTarget` is unused by the Phase 6 UI (which shows qualitative labels
// only) and is reserved for Phase 7 prompt assembly.
export const LENGTHS = [
  {
    id: 'short',
    label: 'Short',
    instruction: 'Keep the response to roughly one or two sentences.',
    approxTarget: 'roughly 1–2 sentences',
  },
  {
    id: 'medium',
    label: 'Medium',
    instruction: 'Keep the response to roughly two to four sentences.',
    approxTarget: 'roughly 2–4 sentences',
  },
  {
    id: 'long',
    label: 'Long',
    instruction: 'Keep the response to roughly four to six sentences; still a comment, not an essay.',
    approxTarget: 'roughly 4–6 sentences; still a comment, not an essay',
  },
] as const

export type Tone = (typeof TONES)[number]['id']
export type Intent = (typeof INTENTS)[number]['id']
export type ResponseLength = (typeof LENGTHS)[number]['id']

export type GenerationPreferences = {
  tone: Tone
  intent: Intent
  length: ResponseLength
}

// A control is never in a blank state and the user is never forced to choose
// before generating.
export const DEFAULT_GENERATION_PREFERENCES: GenerationPreferences = {
  tone: 'professional',
  intent: 'add-insight',
  length: 'medium',
}

function idGuard<Id extends string>(rows: readonly { id: Id }[]): (value: unknown) => value is Id {
  const ids = new Set<string>(rows.map((row) => row.id))
  return (value: unknown): value is Id => typeof value === 'string' && ids.has(value)
}

export const isTone = idGuard(TONES)
export const isIntent = idGuard(INTENTS)
export const isResponseLength = idGuard(LENGTHS)

// Strict: a non-null object with exactly `tone`, `intent`, `length`, each a known
// id. Extra keys are rejected, not stripped — mirrors `isGenerationRequest`.
// Storage reads fall back to the default on `false`; a runtime-message boundary
// (Phase 7) must reject with a typed error instead.
export function isGenerationPreferences(value: unknown): value is GenerationPreferences {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    isTone(candidate.tone) &&
    isIntent(candidate.intent) &&
    isResponseLength(candidate.length) &&
    Object.keys(candidate).length === 3
  )
}

// Pure: a function of the preferences object alone — no interaction kind, no
// post/comment text, no provider id. Returns exactly three strings in the fixed
// order [intent, tone, length] ("what to say", "how it sounds", "how long").
// Never persisted, never messaged, never sent to the LinkedIn page.
export function preferencesToInstructions(prefs: GenerationPreferences): readonly string[] {
  const intent = INTENTS.find((row) => row.id === prefs.intent)
  const tone = TONES.find((row) => row.id === prefs.tone)
  const length = LENGTHS.find((row) => row.id === prefs.length)
  if (!intent || !tone || !length) {
    // Unreachable when `prefs` is a validated GenerationPreferences; the guard is
    // the contract. Fail loud rather than emit `undefined` into a prompt.
    throw new Error('preferencesToInstructions received an unknown preference id')
  }
  return [intent.instruction, tone.instruction, length.instruction]
}
