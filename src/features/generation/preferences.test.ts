import { describe, expect, it } from 'vitest'

import {
  DEFAULT_GENERATION_PREFERENCES,
  INTENTS,
  LENGTHS,
  TONES,
  isGenerationPreferences,
  isIntent,
  isResponseLength,
  isTone,
  preferencesToInstructions,
  type GenerationPreferences,
} from './preferences'

const ALL_ROWS = [...TONES, ...INTENTS, ...LENGTHS]

// ADR-0009: instruction text is provider-neutral and carries no LinkedIn content.
const BANNED_SUBSTRINGS = ['openai', 'gpt', 'claude', 'linkedin', 'http', 'api key']
// ADR-0010 sharpened the strings (concrete lever + explicit "don't"), raising the bound.
const MAX_INSTRUCTION_WORDS = 40

// Parse "N sentence", "N–M sentences" or "N-M sentences" from a Length
// instruction; a bare count is the range [N, N].
function sentenceRange(instruction: string): [number, number] {
  const match = instruction.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s+sentences?/)
  if (!match) throw new Error(`no sentence range in "${instruction}"`)
  return [Number(match[1]), Number(match[2] ?? match[1])]
}

describe('Response Controls registries', () => {
  it('every row has a unique, non-empty id / label / instruction', () => {
    const ids = ALL_ROWS.map((row) => row.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const row of ALL_ROWS) {
      expect(row.id.trim().length).toBeGreaterThan(0)
      expect(row.label.trim().length).toBeGreaterThan(0)
      expect(row.instruction.trim().length).toBeGreaterThan(0)
    }
  })

  it('every instruction is terse and provider-/LinkedIn-neutral', () => {
    for (const row of ALL_ROWS) {
      const words = row.instruction.trim().split(/\s+/)
      expect(words.length, `"${row.instruction}" is too long`).toBeLessThanOrEqual(MAX_INSTRUCTION_WORDS)
      const lower = row.instruction.toLowerCase()
      for (const banned of BANNED_SUBSTRINGS) {
        expect(lower.includes(banned), `"${row.instruction}" contains banned "${banned}"`).toBe(false)
      }
    }
  })

  it('every Length row carries a non-empty approxTarget', () => {
    for (const row of LENGTHS) {
      expect(row.approxTarget.trim().length).toBeGreaterThan(0)
    }
  })

  it('the three Length instructions have non-overlapping, ascending sentence ranges (ADR-0010)', () => {
    const [short, medium, long] = LENGTHS.map((row) => sentenceRange(row.instruction))
    expect(short![1]).toBeLessThan(medium![0])
    expect(medium![1]).toBeLessThan(long![0])
  })

  it('the three Length instructions are mutually distinct', () => {
    const instructions = LENGTHS.map((row) => row.instruction)
    expect(new Set(instructions).size).toBe(3)
  })

  it('has the agreed v1 vocabulary', () => {
    expect(TONES.map((r) => r.id)).toEqual(['professional', 'friendly', 'confident', 'thoughtful'])
    expect(INTENTS.map((r) => r.id)).toEqual([
      'support',
      'add-insight',
      'ask-question',
      'answer',
      'disagree',
      'congratulate',
    ])
    expect(LENGTHS.map((r) => r.id)).toEqual(['short', 'medium', 'long'])
  })
})

describe('id guards', () => {
  it('accept every valid id', () => {
    for (const row of TONES) expect(isTone(row.id)).toBe(true)
    for (const row of INTENTS) expect(isIntent(row.id)).toBe(true)
    for (const row of LENGTHS) expect(isResponseLength(row.id)).toBe(true)
  })

  it.each([undefined, null, 42, {}, [], '', 'sarcastic', 'PROFESSIONAL'])('reject %j', (value) => {
    expect(isTone(value)).toBe(false)
    expect(isIntent(value)).toBe(false)
    expect(isResponseLength(value)).toBe(false)
  })

  it('do not confuse ids across categories', () => {
    expect(isIntent('professional')).toBe(false)
    expect(isTone('support')).toBe(false)
    expect(isResponseLength('friendly')).toBe(false)
  })
})

describe('isGenerationPreferences — strict guard', () => {
  it('accepts a valid triple and the default', () => {
    expect(isGenerationPreferences(DEFAULT_GENERATION_PREFERENCES)).toBe(true)
    expect(isGenerationPreferences({ tone: 'friendly', intent: 'disagree', length: 'long' })).toBe(true)
  })

  it.each([
    ['missing key', { tone: 'friendly', intent: 'disagree' }],
    ['extra key', { tone: 'friendly', intent: 'disagree', length: 'long', style: 'punchy' }],
    ['unknown tone', { tone: 'sarcastic', intent: 'disagree', length: 'long' }],
    ['unknown intent', { tone: 'friendly', intent: 'clarify', length: 'long' }],
    ['unknown length', { tone: 'friendly', intent: 'disagree', length: 'epic' }],
    ['nested wrong type', { tone: 5, intent: 'disagree', length: 'long' }],
    ['not an object', 'friendly'],
    ['null', null],
    ['array', ['friendly', 'disagree', 'long']],
  ])('rejects %s', (_label, value) => {
    expect(isGenerationPreferences(value)).toBe(false)
  })
})

describe('DEFAULT_GENERATION_PREFERENCES', () => {
  it('is { professional, add-insight, medium } and every id exists', () => {
    expect(DEFAULT_GENERATION_PREFERENCES).toEqual({
      tone: 'professional',
      intent: 'add-insight',
      length: 'medium',
    })
    expect(isTone(DEFAULT_GENERATION_PREFERENCES.tone)).toBe(true)
    expect(isIntent(DEFAULT_GENERATION_PREFERENCES.intent)).toBe(true)
    expect(isResponseLength(DEFAULT_GENERATION_PREFERENCES.length)).toBe(true)
  })
})

describe('preferencesToInstructions', () => {
  it('returns exactly [intent, tone, length] instructions in that order', () => {
    const prefs: GenerationPreferences = { tone: 'confident', intent: 'ask-question', length: 'short' }
    const out = preferencesToInstructions(prefs)
    expect(out).toEqual([
      INTENTS.find((r) => r.id === 'ask-question')!.instruction,
      TONES.find((r) => r.id === 'confident')!.instruction,
      LENGTHS.find((r) => r.id === 'short')!.instruction,
    ])
  })

  it('produces three non-empty strings for all 72 combinations', () => {
    let combinations = 0
    for (const tone of TONES) {
      for (const intent of INTENTS) {
        for (const length of LENGTHS) {
          const out = preferencesToInstructions({ tone: tone.id, intent: intent.id, length: length.id })
          expect(out).toHaveLength(3)
          for (const line of out) expect(typeof line === 'string' && line.length > 0).toBe(true)
          combinations += 1
        }
      }
    }
    expect(combinations).toBe(TONES.length * INTENTS.length * LENGTHS.length)
    expect(combinations).toBe(72)
  })

  it('depends only on GenerationPreferences — no interaction kind, same input same output', () => {
    const prefs: GenerationPreferences = { tone: 'thoughtful', intent: 'answer', length: 'long' }
    expect(preferencesToInstructions(prefs)).toEqual(preferencesToInstructions({ ...prefs }))
    // The signature takes one argument; there is no interaction-kind parameter.
    expect(preferencesToInstructions).toHaveLength(1)
  })
})
