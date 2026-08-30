import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runGenerationForTest } from './generation'

const store = new Map<string, unknown>()
const permissionGranted = { value: true }
const fetchMock = vi.fn()

function setupChrome() {
  store.clear()
  permissionGranted.value = true
  vi.stubGlobal('chrome', {
    runtime: { id: 'ext', onConnect: { addListener: vi.fn() }, onMessage: { addListener: vi.fn() } },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store.get(key) })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.entries(values).forEach(([k, v]) => store.set(k, v))
        }),
        remove: vi.fn(async (key: string) => {
          store.delete(key)
        }),
      },
    },
    permissions: { contains: vi.fn(async () => permissionGranted.value) },
  })
  vi.stubGlobal('fetch', fetchMock)
}

const REQUEST = { interactionKind: 'post-comment' as const, postText: 'A LinkedIn post.' }
const OK_BODY = { choices: [{ message: { content: 'A drafted reply.' } }] }

function run(request: unknown = REQUEST) {
  return runGenerationForTest(request, new AbortController().signal)
}

beforeEach(setupChrome)
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('service-worker generation orchestrator — preflight', () => {
  it('provider-not-configured when no config', async () => {
    await expect(run()).resolves.toEqual({ ok: false, error: { kind: 'provider-not-configured' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('provider-not-configured when the host permission is not granted', async () => {
    store.set('modaicom.provider.config', { providerId: 'openai', model: 'gpt-4o-mini' })
    store.set('modaicom.provider.openai.apiKey', 'sk-live-abc')
    permissionGranted.value = false
    await expect(run()).resolves.toEqual({ ok: false, error: { kind: 'provider-not-configured' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('api-key-missing when configured but no key stored', async () => {
    store.set('modaicom.provider.config', { providerId: 'openai', model: 'gpt-4o-mini' })
    await expect(run()).resolves.toEqual({ ok: false, error: { kind: 'api-key-missing' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('transmission-not-consented when key present but no consent', async () => {
    store.set('modaicom.provider.config', { providerId: 'openai', model: 'gpt-4o-mini' })
    store.set('modaicom.provider.openai.apiKey', 'sk-live-abc')
    await expect(run()).resolves.toEqual({ ok: false, error: { kind: 'transmission-not-consented' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('invalid-response when the request fails the strict guard', async () => {
    store.set('modaicom.provider.config', { providerId: 'openai', model: 'gpt-4o-mini' })
    store.set('modaicom.provider.openai.apiKey', 'sk-live-abc')
    store.set('modaicom.provider.consent', { providerId: 'openai', consentedAt: Date.now() })
    await expect(run({ interactionKind: 'post-comment', postText: 'x', authorDisplayName: 'Ada' })).resolves.toEqual({
      ok: false,
      error: { kind: 'invalid-response' },
    })
  })
})

describe('service-worker generation orchestrator — happy path', () => {
  beforeEach(() => {
    store.set('modaicom.provider.config', { providerId: 'openai', model: 'gpt-4o-mini' })
    store.set('modaicom.provider.openai.apiKey', 'sk-live-abc')
    store.set('modaicom.provider.consent', { providerId: 'openai', consentedAt: Date.now() })
  })

  it('reads the key from storage, calls the provider, returns the text', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(OK_BODY), { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(run()).resolves.toEqual({ ok: true, text: 'A drafted reply.' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-live-abc')
    const body = JSON.parse(init.body as string)
    // the request the popup sends never contains names / identifiers; assert the
    // outbound provider body carries only the authored text
    expect(init.body as string).not.toContain('Ada')
    expect(init.body as string).not.toContain('urn:li:activity')
    expect(body.messages[1].content).toContain('A LinkedIn post.')
  })

  it('surfaces provider errors as typed kinds', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }))
    await expect(run()).resolves.toEqual({ ok: false, error: { kind: 'authentication-failed' } })
  })
})
