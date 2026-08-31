import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearApiKey,
  hasApiKey,
  readActiveConfig,
  readActiveProviderId,
  readApiKey,
  readConsent,
  readModel,
  readProviderStatus,
  readSetupSummary,
  writeActiveProviderId,
  writeApiKey,
  writeConsent,
  writeModel,
} from './keyStore'

const store = new Map<string, unknown>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store.get(key) })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.entries(values).forEach(([k, v]) => store.set(k, v))
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          ;(Array.isArray(keys) ? keys : [keys]).forEach((k) => store.delete(k))
        }),
      },
    },
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('keyStore — per-provider read/write', () => {
  it('stores the key, model, consent, and active id under per-provider keys', async () => {
    await writeActiveProviderId('openai')
    await writeApiKey('openai', 'sk-abc')
    await writeModel('openai', 'gpt-4o-mini')
    await writeConsent('openai')

    expect(await readActiveProviderId()).toBe('openai')
    expect(await readApiKey('openai')).toBe('sk-abc')
    expect(await hasApiKey('openai')).toBe(true)
    expect(await readModel('openai')).toBe('gpt-4o-mini')
    expect((await readConsent('openai'))?.consentedAt).toEqual(expect.any(Number))
    expect(store.get('modaicom.provider.openai.apiKey')).toBe('sk-abc')
  })

  it('keeps a second provider’s key isolated across a switch', async () => {
    await writeApiKey('openai', 'sk-openai')
    await writeApiKey('groq', 'gsk-groq')
    await writeActiveProviderId('groq')
    expect(await readApiKey('openai')).toBe('sk-openai')
    await clearApiKey('groq')
    expect(await hasApiKey('groq')).toBe(false)
    expect(await hasApiKey('openai')).toBe(true)
  })

  it('readActiveConfig is undefined until both an active provider and a model exist', async () => {
    expect(await readActiveConfig()).toBeUndefined()
    await writeActiveProviderId('openai')
    expect(await readActiveConfig()).toBeUndefined()
    await writeModel('openai', 'gpt-4o-mini')
    expect(await readActiveConfig()).toEqual({ providerId: 'openai', model: 'gpt-4o-mini' })
  })
})

describe('keyStore — readSetupSummary carries no key values', () => {
  it('reports booleans only', async () => {
    await writeActiveProviderId('openai')
    await writeApiKey('openai', 'sk-secret')
    await writeModel('openai', 'gpt-4o-mini')

    const summary = await readSetupSummary()
    expect(summary.active).toEqual({ providerId: 'openai', model: 'gpt-4o-mini' })
    expect(summary.providers.openai).toEqual({ hasKey: true, hasConsent: false })
    expect(JSON.stringify(summary)).not.toContain('sk-secret')
  })
})

describe('keyStore — lazy v1.0.0 migration', () => {
  it('converts the legacy record to the per-provider layout and removes the old keys', async () => {
    store.set('modaicom.provider.config', { providerId: 'openai', model: 'gpt-4o-mini' })
    store.set('modaicom.provider.consent', { providerId: 'openai', consentedAt: 999 })
    store.set('modaicom.provider.openai.apiKey', 'sk-legacy')

    // any read triggers the migration
    expect(await readActiveProviderId()).toBe('openai')
    expect(await readModel('openai')).toBe('gpt-4o-mini')
    expect(await readConsent('openai')).toEqual({ consentedAt: 999 })
    expect(await readApiKey('openai')).toBe('sk-legacy')
    expect(store.has('modaicom.provider.config')).toBe(false)
    expect(store.has('modaicom.provider.consent')).toBe(false)
  })

  it('an unrecognised legacy baseUrl keeps openai and drops the baseUrl', async () => {
    store.set('modaicom.provider.config', {
      providerId: 'openai',
      model: 'some-model',
      baseUrl: 'https://api.unknown.example/v1',
    })
    store.set('modaicom.provider.openai.apiKey', 'sk-legacy')

    const status = await readProviderStatus()
    expect(status).toMatchObject({ configured: true, providerId: 'openai', model: 'some-model' })
    expect(store.get('modaicom.provider.active')).toBe('openai')
  })

  it('concurrent reads during migration do not lose the key', async () => {
    store.set('modaicom.provider.config', { providerId: 'openai', model: 'gpt-4o-mini' })
    store.set('modaicom.provider.openai.apiKey', 'sk-legacy')
    const [id, key, model] = await Promise.all([readActiveProviderId(), readApiKey('openai'), readModel('openai')])
    expect(id).toBe('openai')
    expect(key).toBe('sk-legacy')
    expect(model).toBe('gpt-4o-mini')
  })

  it('does not run once the per-provider layout is already present', async () => {
    store.set('modaicom.provider.active', 'openai')
    store.set('modaicom.provider.openai.model', 'gpt-4o')
    store.set('modaicom.provider.config', { providerId: 'openai', model: 'stale' })

    expect(await readModel('openai')).toBe('gpt-4o')
    expect(store.has('modaicom.provider.config')).toBe(true)
  })
})
