import { afterEach, describe, expect, it, vi } from 'vitest'

import { getProvider, KNOWN_PROVIDER_IDS } from './registry'
import type { GenerationErrorKind } from '../types'

// Provider-independence, enforced in CI (ADR-0012): every adapter in the
// registry — the shared transport's presets and the dedicated Anthropic adapter
// alike — must map the same HTTP reality onto the same GenerationErrorKind. As
// providers are added (Tickets 2–4) they join this table automatically.

const fetchMock = vi.fn()

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

const HTTP_MATRIX: [number, GenerationErrorKind][] = [
  [401, 'authentication-failed'],
  [403, 'authentication-failed'],
  [429, 'rate-limited'],
  [500, 'provider-error'],
  [503, 'provider-error'],
]

describe.each(KNOWN_PROVIDER_IDS)('provider %s — HTTP error mapping is provider-independent', (id) => {
  const provider = getProvider(id)!

  function stub(status: number) {
    fetchMock.mockResolvedValue(new Response('{}', { status }))
    vi.stubGlobal('fetch', fetchMock)
  }

  const call = (which: 'generate' | 'listModels') =>
    which === 'generate'
      ? provider.generate(
          { system: 'S', user: 'U' },
          { model: 'm', apiKey: 'k', signal: new AbortController().signal },
        )
      : provider.listModels({ apiKey: 'k', signal: new AbortController().signal })

  it.each(HTTP_MATRIX)('generate: HTTP %i -> %s', async (status, kind) => {
    stub(status)
    await expect(call('generate')).resolves.toMatchObject({ ok: false, error: { kind } })
  })

  it.each(HTTP_MATRIX)('listModels: HTTP %i -> %s', async (status, kind) => {
    stub(status)
    await expect(call('listModels')).resolves.toMatchObject({ ok: false, error: { kind } })
  })

  it('generate: a generation-time 404 -> model-not-available (non-retryable)', async () => {
    stub(404)
    await expect(call('generate')).resolves.toMatchObject({ ok: false, error: { kind: 'model-not-available' } })
  })

  it('a fetch throw -> network-error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(call('generate')).resolves.toMatchObject({ ok: false, error: { kind: 'network-error' } })
    await expect(call('listModels')).resolves.toMatchObject({ ok: false, error: { kind: 'network-error' } })
  })
})
