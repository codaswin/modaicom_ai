import { afterEach, describe, expect, it, vi } from 'vitest'

import { createOpenAiCompatibleProvider } from './openaiCompatible'
import type { ProviderPreset } from './preset'
import { OPENAI_PRESET } from './presets'

const fetchMock = vi.fn()

function stubFetch(impl: (url: string, init: RequestInit) => unknown) {
  fetchMock.mockImplementation((url: string, init: RequestInit) => Promise.resolve(impl(url, init)))
  vi.stubGlobal('fetch', fetchMock)
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
}

// A synthetic preset that exercises the transport's parameterisation without
// depending on any real provider's quirks.
const FAKE_PRESET: ProviderPreset = {
  id: 'fake',
  label: 'Fake',
  baseUrl: 'https://fake.example/v9',
  host: 'https://fake.example/*',
  keyAuth: 'bearer',
  listModels: {
    path: '/models',
    parse: (body) => {
      const data = (body as { data?: { id: string; display_name?: string }[] }).data ?? []
      return data.map((row) => (row.display_name ? { id: row.id, label: row.display_name } : { id: row.id }))
    },
  },
  modelFilter: { allow: [/^good-/] },
  fallbackModels: [{ id: 'good-fallback' }],
}

const fake = createOpenAiCompatibleProvider(FAKE_PRESET)
const openai = createOpenAiCompatibleProvider(OPENAI_PRESET)

function generate(provider = fake, opts: Record<string, unknown> = {}) {
  return provider.generate(
    { system: 'S', user: 'U' },
    { model: 'good-1', apiKey: 'key-123', signal: new AbortController().signal, ...opts },
  )
}

function listModels(provider = fake) {
  return provider.listModels({ apiKey: 'key-123', signal: new AbortController().signal })
}

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('openai-compatible transport — generate request', () => {
  it('POSTs {baseUrl}/chat/completions with model, system+user messages and the preset auth', async () => {
    let seenUrl = ''
    let seenInit: RequestInit = {}
    stubFetch((url, init) => {
      seenUrl = url
      seenInit = init
      return jsonResponse({ choices: [{ message: { content: 'Draft.' } }] })
    })
    await generate()
    expect(seenUrl).toBe('https://fake.example/v9/chat/completions')
    expect((seenInit.headers as Record<string, string>).authorization).toBe('Bearer key-123')
    const body = JSON.parse(seenInit.body as string)
    expect(body.model).toBe('good-1')
    expect(body.messages).toEqual([
      { role: 'system', content: 'S' },
      { role: 'user', content: 'U' },
    ])
  })

  it('uses the OpenAI preset endpoint — the base URL is not a runtime option', async () => {
    let seenUrl = ''
    stubFetch((url) => {
      seenUrl = url
      return jsonResponse({ choices: [{ message: { content: 'x' } }] })
    })
    await generate(openai)
    expect(seenUrl).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('includes temperature and max_tokens when supplied, omits them otherwise', async () => {
    let seenInit: RequestInit = {}
    stubFetch((_url, init) => {
      seenInit = init
      return jsonResponse({ choices: [{ message: { content: 'x' } }] })
    })
    await generate(fake, { temperature: 0.6, maxTokens: 220 })
    let body = JSON.parse(seenInit.body as string)
    expect(body.temperature).toBe(0.6)
    expect(body.max_tokens).toBe(220)

    await generate()
    body = JSON.parse(seenInit.body as string)
    expect('temperature' in body).toBe(false)
    expect('max_tokens' in body).toBe(false)
  })
})

describe('openai-compatible transport — generate response', () => {
  it('returns the trimmed message content on success', async () => {
    stubFetch(() => jsonResponse({ choices: [{ message: { content: '  Draft.  ' } }] }))
    await expect(generate()).resolves.toEqual({ ok: true, text: 'Draft.' })
  })

  it('returns a truncated (finish_reason: length) response rather than erroring', async () => {
    stubFetch(() => jsonResponse({ choices: [{ finish_reason: 'length', message: { content: 'A partial draft' } }] }))
    await expect(generate()).resolves.toEqual({ ok: true, text: 'A partial draft' })
  })

  it.each([
    ['non-JSON body', () => new Response('not json', { status: 200 })],
    ['missing content', () => jsonResponse({ choices: [{ message: {} }] })],
    ['no choices', () => jsonResponse({ choices: [] })],
    ['200 with an error body', () => jsonResponse({ error: { message: 'quota exceeded' } })],
  ])('maps %s to invalid-response', async (_label, impl) => {
    stubFetch(impl as () => Response)
    await expect(generate()).resolves.toEqual({ ok: false, error: { kind: 'invalid-response' } })
  })
})

describe('openai-compatible transport — generate errors', () => {
  it.each([
    [401, { kind: 'authentication-failed' }],
    [403, { kind: 'authentication-failed' }],
    [404, { kind: 'model-not-available' }],
    [500, { kind: 'provider-error' }],
    [400, { kind: 'provider-error' }],
  ])('maps HTTP %i', async (status, error) => {
    stubFetch(() => jsonResponse({ error: {} }, { status }))
    await expect(generate()).resolves.toEqual({ ok: false, error })
  })

  it('maps 429 with Retry-After to rate-limited with retryAfterMs', async () => {
    stubFetch(() => jsonResponse({}, { status: 429, headers: { 'retry-after': '30' } }))
    await expect(generate()).resolves.toEqual({ ok: false, error: { kind: 'rate-limited', retryAfterMs: 30000 } })
  })

  it('maps a fetch throw to network-error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generate()).resolves.toEqual({ ok: false, error: { kind: 'network-error' } })
  })

  it('maps an aborted fetch to generation-cancelled', async () => {
    const controller = new AbortController()
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    vi.stubGlobal('fetch', fetchMock)
    controller.abort('cancelled')
    await expect(generate(fake, { signal: controller.signal })).resolves.toEqual({
      ok: false,
      error: { kind: 'generation-cancelled' },
    })
  })

  it('maps a timeout abort to request-timeout', async () => {
    const signal = AbortSignal.timeout(0)
    fetchMock.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
    vi.stubGlobal('fetch', fetchMock)
    await new Promise((r) => setTimeout(r, 2))
    await expect(generate(fake, { signal })).resolves.toEqual({ ok: false, error: { kind: 'request-timeout' } })
  })
})

describe('openai-compatible transport — listModels', () => {
  it('GETs {baseUrl}/models with the list auth and returns filtered models', async () => {
    let seenUrl = ''
    let seenInit: RequestInit = {}
    stubFetch((url, init) => {
      seenUrl = url
      seenInit = init
      return jsonResponse({
        data: [
          { id: 'good-1', display_name: 'Good One' },
          { id: 'good-2' },
          { id: 'bad-1' },
        ],
      })
    })
    const result = await listModels()
    expect(seenUrl).toBe('https://fake.example/v9/models')
    expect((seenInit.headers as Record<string, string>).authorization).toBe('Bearer key-123')
    expect(seenInit.method).toBe('GET')
    expect(result).toEqual({ ok: true, models: [{ id: 'good-1', label: 'Good One' }, { id: 'good-2' }] })
  })

  it('parses the real OpenAI list shape and keeps only chat models', async () => {
    stubFetch(() =>
      jsonResponse({
        object: 'list',
        data: [
          { id: 'gpt-4o-mini', object: 'model' },
          { id: 'text-embedding-3-small', object: 'model' },
          { id: 'whisper-1', object: 'model' },
        ],
      }),
    )
    await expect(listModels(openai)).resolves.toEqual({ ok: true, models: [{ id: 'gpt-4o-mini' }] })
  })

  it('a 200 with an unparseable or empty body is ok with no models (caller falls back)', async () => {
    stubFetch(() => new Response('not json', { status: 200 }))
    await expect(listModels()).resolves.toEqual({ ok: true, models: [] })
  })

  it.each([
    [401, { kind: 'authentication-failed' }],
    [429, { kind: 'rate-limited' }],
    [500, { kind: 'provider-error' }],
    // a 404 on the list route is a provider/endpoint error, never the
    // generation-time `model-not-available`
    [404, { kind: 'provider-error' }],
  ])('maps HTTP %i to a typed error', async (status, error) => {
    stubFetch(() => jsonResponse({}, { status }))
    await expect(listModels()).resolves.toEqual({ ok: false, error })
  })

  it('maps a fetch throw to network-error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(listModels()).resolves.toEqual({ ok: false, error: { kind: 'network-error' } })
  })
})
