import { afterEach, describe, expect, it, vi } from 'vitest'

import { modelFilter } from './modelFilter'
import { GROQ_PRESET, OPENAI_PRESET, XAI_PRESET } from './presets'
import { getProvider } from './registry'

const fetchMock = vi.fn()

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

// Each OpenAI-shaped preset: its baseUrl is used verbatim and its modelFilter
// keeps only chat models. The transport itself is covered in
// openaiCompatible.test.ts — here we assert the preset data.

describe('Groq preset', () => {
  it('generates against the Groq OpenAI-compatible endpoint', async () => {
    let seenUrl = ''
    fetchMock.mockImplementation((url: string) => {
      seenUrl = url
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    await getProvider('groq')!.generate(
      { system: 'S', user: 'U' },
      { model: 'llama-3.3-70b-versatile', apiKey: 'gsk_x', signal: new AbortController().signal },
    )
    expect(seenUrl).toBe('https://api.groq.com/openai/v1/chat/completions')
  })

  it('drops whisper / tts / guard models', () => {
    const raw = [
      { id: 'llama-3.3-70b-versatile' },
      { id: 'whisper-large-v3' },
      { id: 'playai-tts' },
      { id: 'meta-llama/llama-guard-4-12b' },
      { id: 'distil-whisper-large-v3-en' },
    ]
    expect(modelFilter(raw, GROQ_PRESET.modelFilter).map((m) => m.id)).toEqual(['llama-3.3-70b-versatile'])
  })
})

describe('xAI preset', () => {
  it('generates against the xAI endpoint', async () => {
    let seenUrl = ''
    fetchMock.mockImplementation((url: string) => {
      seenUrl = url
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    await getProvider('xai')!.generate(
      { system: 'S', user: 'U' },
      { model: 'grok-4', apiKey: 'xai-x', signal: new AbortController().signal },
    )
    expect(seenUrl).toBe('https://api.x.ai/v1/chat/completions')
  })

  it('keeps grok chat models and drops image models', () => {
    const raw = [{ id: 'grok-4' }, { id: 'grok-3-mini' }, { id: 'grok-2-image-1212' }, { id: 'other-model' }]
    expect(modelFilter(raw, XAI_PRESET.modelFilter).map((m) => m.id)).toEqual(['grok-4', 'grok-3-mini'])
  })
})

describe('every OpenAI-shaped preset', () => {
  it.each([OPENAI_PRESET, GROQ_PRESET, XAI_PRESET])('$id: bearer auth, /models list, non-empty fallback list', (preset) => {
    expect(preset.keyAuth).toBe('bearer')
    expect(preset.listModels.path).toBe('/models')
    expect(preset.fallbackModels.length).toBeGreaterThan(0)
    expect(preset.host.endsWith('/*')).toBe(true)
  })
})
