import {
  generationKey,
  isGenerationRecord,
  isRelayMessage,
  isSessionRelayRecord,
  relayKey,
  RELAY_TTL_MS,
  RELAY_VERSION,
  type GenerationRecord,
  type RelayMessage,
  type SessionRelayRecord,
} from '../shared/relay'

const tabOperations = new Map<number, Promise<void>>()

function serializeTabOperation<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
  const previous = tabOperations.get(tabId) ?? Promise.resolve()
  const current = previous.then(operation, operation)
  const chained = current.then(() => undefined, () => undefined)
  tabOperations.set(tabId, chained)
  return current.finally(() => {
    if (tabOperations.get(tabId) === chained) tabOperations.delete(tabId)
  })
}

async function clearRelay(tabId: number, removeGeneration = false): Promise<void> {
  await serializeTabOperation(tabId, async () => {
    const now = Date.now()
    const generationRecord: GenerationRecord = { version: RELAY_VERSION, generation: now * 1000 - 1000, createdAt: now, expiresAt: now + RELAY_TTL_MS }
    await chrome.storage.session.remove(relayKey(tabId))
    if (removeGeneration) await chrome.storage.session.remove(generationKey(tabId))
    else await chrome.storage.session.set({ [generationKey(tabId)]: generationRecord })
  })
}

async function writeRelay(tabId: number, generation: number, result: SessionRelayRecord['result']): Promise<void> {
  await serializeTabOperation(tabId, async () => {
    const now = Date.now()
    const generationStorageKey = generationKey(tabId)
    const generationValue = (await chrome.storage.session.get(generationStorageKey))[generationStorageKey]
    const existingGeneration = isGenerationRecord(generationValue) ? generationValue : undefined
    if (existingGeneration && existingGeneration.expiresAt <= now) await chrome.storage.session.remove(generationStorageKey)
    if (existingGeneration && existingGeneration.expiresAt > now && generation <= existingGeneration.generation) return
    const key = relayKey(tabId)
    const existingValue = (await chrome.storage.session.get(key))[key]
    const existing = isSessionRelayRecord(existingValue) ? existingValue : undefined
    if (existing && existing.expiresAt <= now) await chrome.storage.session.remove(key)
    if (existing && existing.expiresAt > now && existing.generation > generation) return
    const record: SessionRelayRecord = { version: RELAY_VERSION, result, createdAt: now, expiresAt: now + RELAY_TTL_MS, generation }
    const nextGeneration: GenerationRecord = { version: RELAY_VERSION, generation, createdAt: now, expiresAt: now + RELAY_TTL_MS }
    await chrome.storage.session.set({ [key]: record, [generationStorageKey]: nextGeneration })
  })
}

async function readAndClearRelay(tabId: number): Promise<SessionRelayRecord['result'] | null> {
  return serializeTabOperation(tabId, async () => {
    const key = relayKey(tabId)
    const value = (await chrome.storage.session.get(key))[key]
    if (!isSessionRelayRecord(value) || value.expiresAt <= Date.now()) {
      await chrome.storage.session.remove(key)
      return null
    }
    await chrome.storage.session.remove(key)
    return value.result
  })
}

export function isAuthorizedRelayMessage(message: RelayMessage, sender: chrome.runtime.MessageSender): boolean {
  if (message.type === 'INLINE_EXTRACTION_RESULT' || message.type === 'CLEAR_RELAY') return typeof sender.tab?.id === 'number'
  return message.type === 'GET_LATEST_RELAY' && sender.tab?.id === undefined
}

async function handleRelayMessage(message: RelayMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (!isAuthorizedRelayMessage(message, sender)) return null
  if (message.type === 'INLINE_EXTRACTION_RESULT') {
    const tabId = sender.tab?.id
    if (typeof tabId !== 'number') return { ok: false }
    await writeRelay(tabId, message.generation, message.result)
    return { ok: true }
  }
  if (message.type === 'CLEAR_RELAY') {
    const tabId = sender.tab?.id
    if (typeof tabId !== 'number') return { ok: false }
    await clearRelay(tabId)
    return { ok: true }
  }
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (typeof activeTab?.id !== 'number') return null
  return readAndClearRelay(activeTab.id)
}

chrome.runtime.onMessage.addListener((rawMessage: unknown, sender, sendResponse) => {
  if (!sender.id || sender.id !== chrome.runtime.id || !isRelayMessage(rawMessage)) return false
  void handleRelayMessage(rawMessage, sender).then(sendResponse, () => sendResponse(null))
  return true
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearRelay(tabId, true)
})

export { clearRelay, handleRelayMessage, readAndClearRelay, writeRelay }
