import {
  isRelayMessage,
  isSessionRelayRecord,
  relayKey,
  RELAY_TTL_MS,
  RELAY_VERSION,
  type RelayMessage,
  type SessionRelayRecord,
} from '../shared/relay'

const tabOperations = new Map<number, Promise<void>>()
const generationBarriers = new Map<number, number>()

function serializeTabOperation<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
  const previous = tabOperations.get(tabId) ?? Promise.resolve()
  const current = previous.then(operation, operation)
  const chained = current.then(() => undefined, () => undefined)
  tabOperations.set(tabId, chained)
  return current.finally(() => {
    if (tabOperations.get(tabId) === chained) tabOperations.delete(tabId)
  })
}

async function clearRelay(tabId: number): Promise<void> {
  await serializeTabOperation(tabId, async () => {
    generationBarriers.set(tabId, Math.max(generationBarriers.get(tabId) ?? 0, Date.now() * 1000 - 1000))
    await chrome.storage.session.remove(relayKey(tabId))
  })
}

async function writeRelay(tabId: number, generation: number, result: SessionRelayRecord['result']): Promise<void> {
  await serializeTabOperation(tabId, async () => {
    const now = Date.now()
    if (generation <= (generationBarriers.get(tabId) ?? 0)) return
    const existingValue = (await chrome.storage.session.get(relayKey(tabId)))[relayKey(tabId)]
    const existing = isSessionRelayRecord(existingValue) ? existingValue : undefined
    if (existing && existing.expiresAt > now && existing.generation > generation) return
    const record: SessionRelayRecord = {
      version: RELAY_VERSION,
      result,
      createdAt: now,
      expiresAt: now + RELAY_TTL_MS,
      generation,
    }
    await chrome.storage.session.set({ [relayKey(tabId)]: record })
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
  if (message.type !== 'GET_LATEST_RELAY' || sender.tab?.id !== undefined) return null
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
  void clearRelay(tabId)
})

export { clearRelay, handleRelayMessage, readAndClearRelay, writeRelay }
