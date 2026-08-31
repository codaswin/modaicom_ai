import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generationKey, relayKey } from '../shared/relay'

const result = { kind: 'no-text' as const }

function setupChrome(store: Map<string, unknown>) {
  const session = {
    get: vi.fn(async (key: string) => ({ [key]: store.get(key) })),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.entries(values).forEach(([key, value]) => store.set(key, value)) }),
    remove: vi.fn(async (key: string) => { store.delete(key) }),
  }
  const openPopup = vi.fn(async () => undefined)
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'extension',
      onMessage: { addListener: vi.fn() },
      onConnect: { addListener: vi.fn() },
    },
    storage: { session, local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) } },
    tabs: { query: vi.fn(async () => [{ id: 1 }]), onRemoved: { addListener: vi.fn() } },
    permissions: { contains: vi.fn(async () => true) },
    action: { openPopup },
  })
  return { session, openPopup }
}

describe('service-worker relay ordering', () => {
  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks() })

  it('rejects a stale result from an older session after cleanup', async () => {
    const store = new Map<string, unknown>()
    setupChrome(store)
    const { handleRelayMessage } = await import('./serviceWorker')
    const sender = { id: 'extension', tab: { id: 1 } } as chrome.runtime.MessageSender
    await handleRelayMessage({ version: 2, type: 'CLEAR_RELAY', sessionId: 'new-session' }, sender)
    await handleRelayMessage({ version: 2, type: 'INLINE_EXTRACTION_RESULT', sessionId: 'old-session', generation: 1, result }, sender)
    expect(store.has(relayKey(1))).toBe(false)
  })

  it('rejects an older same-session generation after route cleanup', async () => {
    const store = new Map<string, unknown>()
    setupChrome(store)
    const { handleRelayMessage } = await import('./serviceWorker')
    const sender = { id: 'extension', tab: { id: 1 } } as chrome.runtime.MessageSender
    await handleRelayMessage({ version: 2, type: 'CLEAR_RELAY', sessionId: 'session-a' }, sender)
    await handleRelayMessage({ version: 2, type: 'INLINE_EXTRACTION_RESULT', sessionId: 'session-a', generation: 1, result }, sender)
    await handleRelayMessage({ version: 2, type: 'CLEAR_RELAY', sessionId: 'session-a' }, sender)
    await handleRelayMessage({ version: 2, type: 'INLINE_EXTRACTION_RESULT', sessionId: 'session-a', generation: 1, result }, sender)
    expect(store.has(relayKey(1))).toBe(false)
  })

  it('returns the result plus the originating session id and generation to the popup', async () => {
    const store = new Map<string, unknown>()
    setupChrome(store)
    const { handleRelayMessage, readAndClearRelay } = await import('./serviceWorker')
    const tabSender = { id: 'extension', tab: { id: 1 } } as chrome.runtime.MessageSender
    await handleRelayMessage(
      { version: 2, type: 'INLINE_EXTRACTION_RESULT', sessionId: 'sess-abc', generation: 5, result },
      tabSender,
    )
    expect(await readAndClearRelay(1)).toEqual({ result, sessionId: 'sess-abc', generation: 5 })
  })

  it('opens the action popup once a fresh extraction result is accepted into the relay', async () => {
    const store = new Map<string, unknown>()
    const { openPopup } = setupChrome(store)
    const { handleRelayMessage } = await import('./serviceWorker')
    const sender = { id: 'extension', tab: { id: 1 } } as chrome.runtime.MessageSender
    await handleRelayMessage(
      { version: 2, type: 'INLINE_EXTRACTION_RESULT', sessionId: 's', generation: 1, result },
      sender,
    )
    expect(openPopup).toHaveBeenCalledTimes(1)
  })

  it('does not open the popup when a stale result is rejected', async () => {
    const store = new Map<string, unknown>()
    const { openPopup } = setupChrome(store)
    const { handleRelayMessage } = await import('./serviceWorker')
    const sender = { id: 'extension', tab: { id: 1 } } as chrome.runtime.MessageSender
    await handleRelayMessage({ version: 2, type: 'CLEAR_RELAY', sessionId: 'new' }, sender)
    await handleRelayMessage(
      { version: 2, type: 'INLINE_EXTRACTION_RESULT', sessionId: 'old', generation: 1, result },
      sender,
    )
    expect(openPopup).not.toHaveBeenCalled()
  })

  it('clears expired generation metadata during relay reads', async () => {
    const store = new Map<string, unknown>()
    const { session } = setupChrome(store)
    const now = Date.now()
    store.set(generationKey(1), { version: 2, generation: 2, counter: 3, sessionId: 's', createdAt: now - 20, expiresAt: now - 1 })
    const { readAndClearRelay } = await import('./serviceWorker')
    await readAndClearRelay(1)
    expect(session.remove).toHaveBeenCalledWith(generationKey(1))
  })
})
