import { afterEach, describe, expect, it, vi } from 'vitest'

import { openaiProvider } from './openai'

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

function generate(opts: Partial<Parameters<typeof openaiProvider.generate>[1]> = {}) {
  return openaiProvider.generate(
    { system: 'S', user: 'U' },
    { model: 'gpt-4o-mini', apiKey: 'sk-test-123', signal: new AbortController().signal, ...opts },
  )
}

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('openai provider — request', () => {
  it('POSTs chat/completions with the model, system+user messages, and bearer key', async () => {
    let seenUrl = ''
    let seenInit: RequestInit = {}
    stubFetch((url, init) => {
      seenUrl = url
      seenInit = init
      return jsonResponse({ choices: [{ message: { content: 'Draft reply.' } }] })
    })
    await generate()
    expect(seenUrl).toBe('https://api.openai.com/v1/chat/completions')
    expect((seenInit.headers as Record<string, string>).authorization).toBe('Bearer sk-test-123')
    const body = JSON.parse(seenInit.body as string)
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.messages).toEqual([
      { role: 'system', content: 'S' },
      { role: 'user', content: 'U' },
    ])
  })

  it('respects a custom baseUrl (compatible providers)', async () => {
    let seenUrl = ''
    stubFetch((url) => {
      seenUrl = url
      return jsonResponse({ choices: [{ message: { content: 'x' } }] })
    })
    await generate({ baseUrl: 'https://api.groq.com/openai/v1/' })
    expect(seenUrl).toBe('https://api.groq.com/openai/v1/chat/completions')
  })

  it('includes temperature and max_tokens when supplied, omits them otherwise', async () => {
    let seenInit: RequestInit = {}
    stubFetch((_url, init) => {
      seenInit = init
      return jsonResponse({ choices: [{ message: { content: 'x' } }] })
    })

    await generate({ temperature: 0.6, maxTokens: 320 })
    let body = JSON.parse(seenInit.body as string)
    expect(body.temperature).toBe(0.6)
    expect(body.max_tokens).toBe(320)

    await generate()
    body = JSON.parse(seenInit.body as string)
    expect('temperature' in body).toBe(false)
    expect('max_tokens' in body).toBe(false)
  })
})

describe('openai provider — response', () => {
  it('returns the trimmed message content on success', async () => {
    stubFetch(() => jsonResponse({ choices: [{ message: { content: '  Draft reply.  ' } }] }))
    await expect(generate()).resolves.toEqual({ ok: true, text: 'Draft reply.' })
  })

  it.each([
    ['non-JSON body', () => new Response('not json', { status: 200 })],
    ['missing content', () => jsonResponse({ choices: [{ message: {} }] })],
    ['empty content', () => jsonResponse({ choices: [{ message: { content: '' } }] })],
    ['whitespace content', () => jsonResponse({ choices: [{ message: { content: '   ' } }] })],
    ['no choices', () => jsonResponse({ choices: [] })],
    ['200 with an error body', () => jsonResponse({ error: { message: 'quota exceeded' } })],
  ])('maps %s to invalid-response', async (_label, impl) => {
    stubFetch(impl as () => Response)
    await expect(generate()).resolves.toEqual({ ok: false, error: { kind: 'invalid-response' } })
  })

  it('returns a truncated (finish_reason: length) response rather than erroring', async () => {
    stubFetch(() =>
      jsonResponse({ choices: [{ finish_reason: 'length', message: { content: 'A partial draft that was cut' } }] }),
    )
    await expect(generate()).resolves.toEqual({ ok: true, text: 'A partial draft that was cut' })
  })
})

describe('openai provider — errors', () => {
  it.each([
    [401, 'authentication-failed'],
    [403, 'authentication-failed'],
    [500, 'provider-error'],
    [404, 'provider-error'],
    [400, 'provider-error'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    stubFetch(() => jsonResponse({ error: {} }, { status }))
    await expect(generate()).resolves.toEqual({ ok: false, error: { kind } })
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
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
    fetchMock.mockRejectedValue(abortErr)
    vi.stubGlobal('fetch', fetchMock)
    controller.abort('cancelled')
    await expect(generate({ signal: controller.signal })).resolves.toEqual({
      ok: false,
      error: { kind: 'generation-cancelled' },
    })
  })

  it('maps a timeout abort to request-timeout', async () => {
    const signal = AbortSignal.timeout(0)
    const abortErr = Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    fetchMock.mockRejectedValue(abortErr)
    vi.stubGlobal('fetch', fetchMock)
    await new Promise((r) => setTimeout(r, 2))
    await expect(generate({ signal })).resolves.toEqual({ ok: false, error: { kind: 'request-timeout' } })
  })
})
