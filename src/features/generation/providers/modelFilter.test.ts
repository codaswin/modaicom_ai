import { describe, expect, it } from 'vitest'

import { modelFilter } from './modelFilter'
import type { RawModelRecord } from './preset'

describe('modelFilter — ID-pattern rules (OpenAI-shaped lists)', () => {
  const rules = {
    allow: [/gpt/, /^o\d/],
    deny: [/embedding/, /audio/, /realtime/, /transcribe/, /moderation/, /image/, /tts/],
  }

  it('keeps chat models and drops non-text models by pattern', () => {
    const raw: RawModelRecord[] = [
      { id: 'gpt-4o' },
      { id: 'gpt-4o-mini' },
      { id: 'o3-mini' },
      { id: 'gpt-4o-realtime-preview' },
      { id: 'gpt-4o-audio-preview' },
      { id: 'text-embedding-3-small' },
      { id: 'omni-moderation-latest' },
      { id: 'tts-1' },
      { id: 'dall-e-3' },
      { id: 'whisper-1' },
    ]
    expect(modelFilter(raw, rules).map((m) => m.id)).toEqual(['gpt-4o', 'gpt-4o-mini', 'o3-mini'])
  })

  it('drops a model that matches no allow pattern', () => {
    expect(modelFilter([{ id: 'claude-sonnet-5' }], rules)).toEqual([])
  })

  it('dedupes by id and preserves first-seen order', () => {
    expect(modelFilter([{ id: 'gpt-4o' }, { id: 'gpt-4o' }], rules)).toEqual([{ id: 'gpt-4o' }])
  })
})

describe('modelFilter — capability predicate (Gemini-shaped list)', () => {
  const rules = { requireMethod: 'generateContent' }

  it('keeps only models whose methods include generateContent, carrying the label', () => {
    const raw: RawModelRecord[] = [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', methods: ['generateContent', 'countTokens'] },
      { id: 'text-embedding-004', label: 'Embedding 004', methods: ['embedContent'] },
      { id: 'gemini-pro-vision', label: 'Vision', methods: ['generateContent'] },
    ]
    expect(modelFilter(raw, rules)).toEqual([
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-pro-vision', label: 'Vision' },
    ])
  })
})

describe('modelFilter — near-passthrough (Anthropic-shaped list)', () => {
  it('keeps every record with no rules', () => {
    const raw: RawModelRecord[] = [
      { id: 'claude-opus-5', label: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    ]
    expect(modelFilter(raw, {})).toEqual(raw)
  })
})
