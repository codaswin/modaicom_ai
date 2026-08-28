import { isPostExtractionResult, type PostExtractionResult } from '../features/linkedin-context/extractPostContext'

export const RELAY_VERSION = 1 as const
export const RELAY_TTL_MS = 5 * 60 * 1000
export const RELAY_KEY_PREFIX = 'modaicom.relay.'

export type InlineExtractionResultMessage = {
  version: typeof RELAY_VERSION
  type: 'INLINE_EXTRACTION_RESULT'
  generation: number
  result: PostExtractionResult
}
export type ClearRelayMessage = { version: typeof RELAY_VERSION; type: 'CLEAR_RELAY' }
export type GetLatestRelayMessage = { version: typeof RELAY_VERSION; type: 'GET_LATEST_RELAY' }
export type RelayMessage = InlineExtractionResultMessage | ClearRelayMessage | GetLatestRelayMessage

export type SessionRelayRecord = {
  version: typeof RELAY_VERSION
  result: PostExtractionResult
  createdAt: number
  expiresAt: number
  generation: number
}

export function relayKey(tabId: number): string {
  return `${RELAY_KEY_PREFIX}${tabId}`
}

export function isRelayMessage(value: unknown): value is RelayMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.version !== RELAY_VERSION || typeof candidate.type !== 'string') return false
  if (candidate.type === 'INLINE_EXTRACTION_RESULT') {
    return typeof candidate.generation === 'number' && Number.isFinite(candidate.generation) && isPostExtractionResult(candidate.result)
  }
  return candidate.type === 'CLEAR_RELAY' || candidate.type === 'GET_LATEST_RELAY'
}

export function isSessionRelayRecord(value: unknown): value is SessionRelayRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.version === RELAY_VERSION &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.expiresAt === 'number' &&
    typeof candidate.generation === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    Number.isFinite(candidate.expiresAt) &&
    Number.isFinite(candidate.generation) &&
    candidate.expiresAt > candidate.createdAt &&
    isPostExtractionResult(candidate.result)
  )
}
