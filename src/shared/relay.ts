import { isInteractionExtractionResult, type InteractionExtractionResult } from '../features/linkedin-context/interactionContext'
import { RELAY_VERSION } from './protocol'

export { RELAY_VERSION }
export const RELAY_TTL_MS = 5 * 60 * 1000
export const RELAY_KEY_PREFIX = 'modaicom.relay.'
export const GENERATION_KEY_PREFIX = 'modaicom.generation.'

export type InlineExtractionResultMessage = {
  version: typeof RELAY_VERSION
  type: 'INLINE_EXTRACTION_RESULT'
  generation: number
  sessionId: string
  result: InteractionExtractionResult
}
export type ClearRelayMessage = { version: typeof RELAY_VERSION; type: 'CLEAR_RELAY'; sessionId?: string }
export type GetLatestRelayMessage = { version: typeof RELAY_VERSION; type: 'GET_LATEST_RELAY' }
export type RelayMessage = InlineExtractionResultMessage | ClearRelayMessage | GetLatestRelayMessage

export type GenerationRecord = {
  version: typeof RELAY_VERSION
  generation: number
  counter: number
  sessionId: string
  createdAt: number
  expiresAt: number
}

export type SessionRelayRecord = {
  version: typeof RELAY_VERSION
  result: InteractionExtractionResult
  createdAt: number
  expiresAt: number
  generation: number
  // The originating Inline Targeting Session's id (Phase 8). Returned to the
  // popup so it can bind a later INSERT_DRAFT to that exact session.
  sessionId: string
}

export function relayKey(tabId: number): string {
  return `${RELAY_KEY_PREFIX}${tabId}`
}

export function generationKey(tabId: number): string {
  return `${GENERATION_KEY_PREFIX}${tabId}`
}

export function isRelayMessage(value: unknown): value is RelayMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.version !== RELAY_VERSION || typeof candidate.type !== 'string') return false
  if (candidate.type === 'INLINE_EXTRACTION_RESULT') {
    return typeof candidate.generation === 'number' && Number.isFinite(candidate.generation) && typeof candidate.sessionId === 'string' && candidate.sessionId.length > 0 && isInteractionExtractionResult(candidate.result)
  }
  if (candidate.type === 'CLEAR_RELAY') return candidate.sessionId === undefined || typeof candidate.sessionId === 'string'
  return candidate.type === 'GET_LATEST_RELAY'
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
    typeof candidate.sessionId === 'string' &&
    isInteractionExtractionResult(candidate.result)
  )
}

export function isGenerationRecord(value: unknown): value is GenerationRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return candidate.version === RELAY_VERSION && typeof candidate.generation === 'number' && Number.isFinite(candidate.generation) && typeof candidate.counter === 'number' && Number.isFinite(candidate.counter) && typeof candidate.sessionId === 'string' && typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt) && typeof candidate.expiresAt === 'number' && Number.isFinite(candidate.expiresAt) && candidate.expiresAt > candidate.createdAt
}
