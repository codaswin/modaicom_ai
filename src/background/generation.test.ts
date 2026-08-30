import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_GENERATION_PREFERENCES } from '../features/generation/preferences'
import { handleOneShotForTest, isExtensionPage, runGenerationForTest } from './generation'

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

function run(request: unknown = REQUEST, preferences: unknown = DEFAULT_GENERATION_PREFERENCES) {
  return runGenerationForTest(request, preferences, new AbortController().signal)
}

// Explicit preferences arg with no default — for the invalid/absent cases.
function runWithPrefs(preferences: unknown) {
  return runGenerationForTest(REQUEST, preferences, new AbortController().signal)
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

  it.each([
    ['missing', undefined],
    ['unknown id', { tone: 'sarcastic', intent: 'disagree', length: 'long' }],
    ['extra key', { tone: 'friendly', intent: 'disagree', length: 'long', style: 'x' }],
    ['not an object', 'friendly'],
  ])('invalid-preferences (no fetch) when preferences are %s', async (_label, preferences) => {
    store.set('modaicom.provider.config', { providerId: 'openai', model: 'gpt-4o-mini' })
    store.set('modaicom.provider.openai.apiKey', 'sk-live-abc')
    store.set('modaicom.provider.consent', { providerId: 'openai', consentedAt: Date.now() })
    await expect(runWithPrefs(preferences)).resolves.toEqual({ ok: false, error: { kind: 'invalid-preferences' } })
    expect(fetchMock).not.toHaveBeenCalled()
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

  it('the outbound system prompt reflects the selected tone / intent / length', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(OK_BODY), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    await run(REQUEST, { tone: 'confident', intent: 'disagree', length: 'short' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const system = JSON.parse(init.body as string).messages[0].content as string
    expect(system.toLowerCase()).toContain('push back')
    expect(system.toLowerCase()).toContain('clear stance')
    expect(system).toContain('1–2 sentences')
    expect(system).not.toContain('2 to 4 sentences')
  })

  it('a different length changes the outbound system prompt', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(OK_BODY), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    await run(REQUEST, { tone: 'confident', intent: 'disagree', length: 'long' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const system = JSON.parse(init.body as string).messages[0].content as string
    expect(system).toContain('5–7 sentences')
    expect(system).not.toContain('1–2 sentences')
  })

  it('never writes preferences to the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(OK_BODY), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    await run(REQUEST, { tone: 'confident', intent: 'disagree', length: 'short' })
    for (const spy of [warn, log]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toMatch(/confident|disagree/)
      }
    }
    warn.mockRestore()
    log.mockRestore()
  })
})

describe('one-shot sender authorisation', () => {
  const EXT_ORIGIN = `chrome-extension://ext`

  it('accepts the popup and the options page (options opens in a tab)', () => {
    expect(isExtensionPage({ id: 'ext', origin: EXT_ORIGIN } as chrome.runtime.MessageSender)).toBe(true)
    // options page: opened in a real tab, so sender.tab is set — origin is what matters
    expect(
      isExtensionPage({
        id: 'ext',
        origin: EXT_ORIGIN,
        url: `${EXT_ORIGIN}/src/options/index.html`,
        tab: { id: 9 } as chrome.tabs.Tab,
      } as chrome.runtime.MessageSender),
    ).toBe(true)
  })

  it('rejects a content script (web-page origin) and a foreign extension id', () => {
    expect(
      isExtensionPage({
        id: 'ext',
        origin: 'https://www.linkedin.com',
        url: 'https://www.linkedin.com/feed/',
        tab: { id: 9 } as chrome.tabs.Tab,
      } as chrome.runtime.MessageSender),
    ).toBe(false)
    expect(isExtensionPage({ id: 'other', origin: EXT_ORIGIN } as chrome.runtime.MessageSender)).toBe(false)
  })

  it('GET_PROVIDER_STATUS from an extension page returns non-secret status', async () => {
    vi.stubGlobal('chrome', {
      runtime: { id: 'ext' },
      storage: { local: { get: vi.fn(async () => ({})) } },
    })
    const reply = await handleOneShotForTest({ v: 2, type: 'GET_PROVIDER_STATUS' }, {
      id: 'ext',
      origin: 'chrome-extension://ext',
    } as chrome.runtime.MessageSender)
    expect(reply).toEqual({ configured: false, consented: false })
  })

  it('GET_PROVIDER_STATUS from a content script is ignored', async () => {
    vi.stubGlobal('chrome', { runtime: { id: 'ext' } })
    const reply = await handleOneShotForTest({ v: 2, type: 'GET_PROVIDER_STATUS' }, {
      id: 'ext',
      origin: 'https://www.linkedin.com',
      url: 'https://www.linkedin.com/feed/',
      tab: { id: 1 } as chrome.tabs.Tab,
    } as chrome.runtime.MessageSender)
    expect(reply).toBeUndefined()
  })
})
