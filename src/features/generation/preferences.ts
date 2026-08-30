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
    instruction:
      'Use a businesslike register: complete sentences, no slang, no exclamation marks, no emoji. Courteous and measured.',
  },
  {
    id: 'friendly',
    label: 'Friendly',
    instruction:
      'Use a warm, conversational register: first person, contractions, an encouraging feel. Not stiff, not gushing.',
  },
  {
    id: 'confident',
    label: 'Confident',
    instruction:
      'Take a clear stance and lead with it. No hedging ("maybe", "I think", "it seems"), no filler qualifiers, no apologies.',
  },
  {
    id: 'thoughtful',
    label: 'Thoughtful',
    instruction:
      'Be reflective: acknowledge a nuance or trade-off and show your reasoning before landing on a view.',
  },
] as const

// One universal Intent set for v1 — identical for a Post-Comment Interaction and
// a Comment-Reply Interaction.
export const INTENTS = [
  {
    id: 'support',
    label: 'Support',
    instruction:
      "Endorse the author's point and strengthen it with one specific reason, example, or corroboration. Do not merely say you agree.",
  },
  {
    id: 'add-insight',
    label: 'Add insight',
    instruction:
      "Add something new: a further angle, a related fact, or an implication the post did not cover. Do not restate the post.",
  },
  {
    id: 'ask-question',
    label: 'Ask a question',
    instruction: 'End with exactly one specific, genuine question that invites the author to say more.',
  },
  {
    id: 'answer',
    label: 'Answer',
    instruction: 'Answer the question the post or comment poses, directly and concretely, in the first sentence.',
  },
  {
    id: 'disagree',
    label: 'Disagree',
    instruction:
      'Push back: name the specific claim you disagree with and give your reason. Stay respectful; do not soften it into agreement.',
  },
  {
    id: 'congratulate',
    label: 'Congratulate',
    instruction:
      'Congratulate the person for the specific achievement described. Warm, sincere, and specific, not generic praise.',
  },
] as const

// Non-overlapping sentence ranges (ADR-0010): "roughly one or two" vs "roughly
// two to four" both admit a 2-sentence reply, so the Phase 6 wording collapsed
// the three lengths. Each instruction now pairs a discrete range with a density
// verb. `approxTarget` is unused by the UI (qualitative labels only); the
// Phase 7 provider tuning derives a token ceiling from the id, not this string.
export const LENGTHS = [
  {
    id: 'short',
    label: 'Short',
    instruction: 'Write 1–2 sentences. Make a single point and stop.',
    approxTarget: '1–2 sentences',
  },
  {
    id: 'medium',
    label: 'Medium',
    instruction: 'Write 3–4 sentences. Develop one idea with a supporting reason or example.',
    approxTarget: '3–4 sentences',
  },
  {
    id: 'long',
    label: 'Long',
    instruction:
      'Write 5–7 sentences, up to two short paragraphs. Develop the point fully — still a comment, not an article.',
    approxTarget: '5–7 sentences, up to two short paragraphs',
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
