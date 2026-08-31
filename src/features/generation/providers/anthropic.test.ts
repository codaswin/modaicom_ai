import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAnthropicProvider } from './anthropic'
import { ANTHROPIC_PRESET } from './presets'

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

const anthropic = createAnthropicProvider(ANTHROPIC_PRESET)

function generate(opts: Record<string, unknown> = {}) {
  return anthropic.generate(
    { system: 'You are helpful.', user: 'Draft a reply.' },
    { model: 'claude-sonnet-4-20250514', apiKey: 'sk-ant-123', signal: new AbortController().signal, ...opts },
  )
}

function listModels() {
  return anthropic.listModels({ apiKey: 'sk-ant-123', signal: new AbortController().signal })
}

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('anthropic adapter — request shaping', () => {
  it('POSTs /v1/messages with x-api-key, anthropic-version, top-level system and a max_tokens', async () => {
    let seenUrl = ''
    let seenInit: RequestInit = {}
    stubFetch((url, init) => {
      seenUrl = url
      seenInit = init
      return jsonResponse({ content: [{ type: 'text', text: 'Draft.' }], stop_reason: 'end_turn' })
    })
    await generate({ maxTokens: 220, temperature: 0.6 })

    expect(seenUrl).toBe('https://api.anthropic.com/v1/messages')
    const h = seenInit.headers as Record<string, string>
    expect(h['x-api-key']).toBe('sk-ant-123')
    expect(h['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(seenInit.body as string)
    expect(body.model).toBe('claude-sonnet-4-20250514')
    expect(body.system).toBe('You are helpful.')
    expect(body.messages).toEqual([{ role: 'user', content: 'Draft a reply.' }])
    expect(body.max_tokens).toBe(220)
    expect(body.temperature).toBe(0.6)
  })

  it('always sends a max_tokens even when the caller omits it', async () => {
    let seenInit: RequestInit = {}
    stubFetch((_url, init) => {
      seenInit = init
      return jsonResponse({ content: [{ type: 'text', text: 'x' }] })
    })
    await generate()
    expect(JSON.parse(seenInit.body as string).max_tokens).toBeGreaterThan(0)
  })
})

describe('anthropic adapter — response', () => {
  it('concatenates the text blocks of content[]', async () => {
    stubFetch(() =>
      jsonResponse({
        content: [
          { type: 'text', text: 'Part one. ' },
          { type: 'text', text: 'Part two.' },
        ],
      }),
    )
    await expect(generate()).resolves.toEqual({ ok: true, text: 'Part one. Part two.' })
  })

  it('returns a truncated (stop_reason: max_tokens) draft rather than erroring', async () => {
    stubFetch(() => jsonResponse({ content: [{ type: 'text', text: 'A partial draft' }], stop_reason: 'max_tokens' }))
    await expect(generate()).resolves.toEqual({ ok: true, text: 'A partial draft' })
  })

  it.each([
    ['non-JSON body', () => new Response('not json', { status: 200 })],
    ['no content array', () => jsonResponse({ stop_reason: 'end_turn' })],
    ['only non-text blocks', () => jsonResponse({ content: [{ type: 'tool_use', id: 'x' }] })],
    ['empty text', () => jsonResponse({ content: [{ type: 'text', text: '   ' }] })],
  ])('maps %s to invalid-response', async (_label, impl) => {
    stubFetch(impl as () => Response)
    await expect(generate()).resolves.toEqual({ ok: false, error: { kind: 'invalid-response' } })
  })
})

describe('anthropic adapter — errors mirror the shared union', () => {
  it.each([
    [401, { kind: 'authentication-failed' }],
    [403, { kind: 'authentication-failed' }],
    [404, { kind: 'model-not-available' }],
    [500, { kind: 'provider-error' }],
    [529, { kind: 'provider-error' }],
  ])('generate: HTTP %i', async (status, error) => {
    stubFetch(() => jsonResponse({ type: 'error' }, { status }))
    await expect(generate()).resolves.toEqual({ ok: false, error })
  })

  it('generate: 429 with retry-after -> rate-limited with retryAfterMs', async () => {
    stubFetch(() => jsonResponse({}, { status: 429, headers: { 'retry-after': '12' } }))
    await expect(generate()).resolves.toEqual({ ok: false, error: { kind: 'rate-limited', retryAfterMs: 12000 } })
  })

  it('generate: a fetch throw -> network-error; an abort -> generation-cancelled', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generate()).resolves.toEqual({ ok: false, error: { kind: 'network-error' } })

    const controller = new AbortController()
    fetchMock.mockRejectedValue(Object.assign(new Error('a'), { name: 'AbortError' }))
    controller.abort('cancelled')
    await expect(generate({ signal: controller.signal })).resolves.toEqual({
      ok: false,
      error: { kind: 'generation-cancelled' },
    })
  })
})

describe('anthropic adapter — listModels', () => {
  it('GETs /v1/models and returns ModelInfo with the display_name as label', async () => {
    let seenUrl = ''
    let seenInit: RequestInit = {}
    stubFetch((url, init) => {
      seenUrl = url
      seenInit = init
      return jsonResponse({
        data: [
          { id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4' },
          { id: 'claude-3-5-haiku-latest', display_name: 'Claude Haiku 3.5' },
        ],
      })
    })
    const result = await listModels()
    expect(seenUrl).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect((seenInit.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-123')
    expect(result).toEqual({
      ok: true,
      models: [
        { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
        { id: 'claude-3-5-haiku-latest', label: 'Claude Haiku 3.5' },
      ],
    })
  })

  it('a 401 on the list is authentication-failed; a 404 is provider-error', async () => {
    stubFetch(() => jsonResponse({}, { status: 401 }))
    await expect(listModels()).resolves.toEqual({ ok: false, error: { kind: 'authentication-failed' } })
    stubFetch(() => jsonResponse({}, { status: 404 }))
    await expect(listModels()).resolves.toEqual({ ok: false, error: { kind: 'provider-error' } })
  })
})
