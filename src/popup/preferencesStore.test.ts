import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_GENERATION_PREFERENCES } from '../features/generation/preferences'
import { readPreferences, writePreferences } from './preferencesStore'

const STORAGE_KEY = 'modaicom.generation.preferences'

const get = vi.fn()
const set = vi.fn()

describe('preferencesStore', () => {
  beforeEach(() => {
    get.mockReset()
    set.mockReset()
    set.mockResolvedValue(undefined)
    vi.stubGlobal('chrome', { storage: { local: { get, set } } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a valid stored triple', async () => {
    get.mockResolvedValue({ [STORAGE_KEY]: { tone: 'friendly', intent: 'disagree', length: 'long' } })
    await expect(readPreferences()).resolves.toEqual({ tone: 'friendly', intent: 'disagree', length: 'long' })
  })

  it('returns the default when nothing is stored', async () => {
    get.mockResolvedValue({})
    await expect(readPreferences()).resolves.toEqual(DEFAULT_GENERATION_PREFERENCES)
  })

  it.each([
    ['corrupt', { tone: 'sarcastic', intent: 'disagree', length: 'long' }],
    ['partial', { tone: 'friendly' }],
    ['extra key', { tone: 'friendly', intent: 'disagree', length: 'long', style: 'punchy' }],
    ['wrong type', 'friendly'],
    ['null', null],
  ])('falls back to the default for a %s stored value', async (_label, stored) => {
    get.mockResolvedValue({ [STORAGE_KEY]: stored })
    await expect(readPreferences()).resolves.toEqual(DEFAULT_GENERATION_PREFERENCES)
  })

  it('returns the default (does not throw) when storage access fails', async () => {
    get.mockRejectedValue(new Error('storage unavailable'))
    await expect(readPreferences()).resolves.toEqual(DEFAULT_GENERATION_PREFERENCES)
  })

  it('persists exactly the id triple, nothing else', async () => {
    await writePreferences({
      tone: 'confident',
      intent: 'answer',
      length: 'short',
      // a stray key a caller might carry past the type
      ...({ leaked: 'author name' } as Record<string, unknown>),
    } as never)
    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith({ [STORAGE_KEY]: { tone: 'confident', intent: 'answer', length: 'short' } })
  })

  it('does not throw when a write fails', async () => {
    set.mockRejectedValue(new Error('quota'))
    await expect(writePreferences(DEFAULT_GENERATION_PREFERENCES)).resolves.toBeUndefined()
  })
})
