// Single source of truth for modaicom's runtime message envelopes. Kept
// dependency-free so any layer (popup, content script, service worker) can
// import it without pulling in adapter or DOM code.

// v2: the relay payload became the discriminated InteractionExtractionResult
// (Phase 4). A bump invalidates stale-shape session records on an extension
// update — a clean cutover, since the relay is only a 5-minute session cache.
export const RELAY_VERSION = 2 as const

// Sent by the popup to the persistent content script to run the on-demand
// individual-post extractor in the page (the Phase 2 fallback). The content
// script owns the DOM and the adapter module scope; the popup only needs the
// typed result back.
export type RequestPageExtractionMessage = {
  version: typeof RELAY_VERSION
  type: 'REQUEST_PAGE_EXTRACTION'
}

export const REQUEST_PAGE_EXTRACTION: RequestPageExtractionMessage = {
  version: RELAY_VERSION,
  type: 'REQUEST_PAGE_EXTRACTION',
}

export function isRequestPageExtractionMessage(value: unknown): value is RequestPageExtractionMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return candidate.version === RELAY_VERSION && candidate.type === 'REQUEST_PAGE_EXTRACTION'
}

// Sent by the popup to the content script to insert a Generated Draft into the
// exact composer that started the Inline Targeting Session (Phase 8 / ADR-0011).
// Additive on RELAY_VERSION — no bump. The draft text never passes through the
// service worker. `sessionId` + `generation` bind the draft to the session that
// produced it; the content script refuses unless both match its live session.
export type InsertDraftMessage = {
  version: typeof RELAY_VERSION
  type: 'INSERT_DRAFT'
  text: string
  sessionId: string
  generation: number
}

export const INSERT_FAILURE_KINDS = [
  'editor-unavailable',
  'route-changed',
  'editor-not-empty',
  'insert-failed',
  'wrong-tab',
] as const
export type InsertFailureKind = (typeof INSERT_FAILURE_KINDS)[number]

export type InsertDraftResponse = { ok: true } | { ok: false; reason: InsertFailureKind }

export function isInsertDraftMessage(value: unknown): value is InsertDraftMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.version === RELAY_VERSION &&
    candidate.type === 'INSERT_DRAFT' &&
    typeof candidate.text === 'string' &&
    candidate.text.length > 0 &&
    typeof candidate.sessionId === 'string' &&
    candidate.sessionId.length > 0 &&
    typeof candidate.generation === 'number' &&
    Number.isFinite(candidate.generation)
  )
}

export function isInsertFailureKind(value: unknown): value is InsertFailureKind {
  return typeof value === 'string' && (INSERT_FAILURE_KINDS as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Generation protocol (Phase 5). A separate version namespace — a relay change
// must not rev generation and vice versa. The API key never appears in any of
// these messages (ADR-0008).
// ---------------------------------------------------------------------------

// v2 (Phase 7 / ADR-0010): REQUEST_GENERATION carries the selected
// { tone, intent, length } as a `preferences` field.
// v3 (Phase 9 / ADR-0012): TEST_PROVIDER (a real ping generation) is replaced by
// TEST_AND_LIST (a zero-token metadata call that validates the key and returns
// the provider's models). Popup, options page, and service worker ship in one
// build, so the bump is a clean lockstep cutover.
export const GENERATION_PROTOCOL_VERSION = 3 as const
export const GENERATION_PORT_NAME = 'modaicom.generation'

// Port (popup <-> service worker), request-scoped.
export type RequestGenerationMessage = {
  v: typeof GENERATION_PROTOCOL_VERSION
  type: 'REQUEST_GENERATION'
  request: unknown // validated by isGenerationRequest in the generation layer
  preferences: unknown // validated by isGenerationPreferences in the service worker
}
export type CancelGenerationMessage = { v: typeof GENERATION_PROTOCOL_VERSION; type: 'CANCEL_GENERATION' }
export type GenerationPortInbound = RequestGenerationMessage | CancelGenerationMessage

export type GenerationResultMessage =
  | { v: typeof GENERATION_PROTOCOL_VERSION; type: 'GENERATION_RESULT'; ok: true; text: string }
  | {
      v: typeof GENERATION_PROTOCOL_VERSION
      type: 'GENERATION_RESULT'
      ok: false
      error: { kind: string; retryAfterMs?: number }
    }

// One-shot (sendMessage), extension-page origin only.
export type GetProviderStatusMessage = { v: typeof GENERATION_PROTOCOL_VERSION; type: 'GET_PROVIDER_STATUS' }
export type RecordConsentMessage = {
  v: typeof GENERATION_PROTOCOL_VERSION
  type: 'RECORD_TRANSMISSION_CONSENT'
  providerId: string
}
// Options-page -> service-worker only. Carries the key transiently for one
// validate-before-save round trip; the SW never persists a key from a message
// (ADR-0008 amendment). The reply is a ConnectionTestResult (see below).
export type TestAndListMessage = {
  v: typeof GENERATION_PROTOCOL_VERSION
  type: 'TEST_AND_LIST'
  providerId: string
  apiKey: string
}
export type GenerationOneShotMessage = GetProviderStatusMessage | RecordConsentMessage | TestAndListMessage

export type ConnectionTestResult =
  | { ok: true; models: { id: string; label?: string }[]; modelSource: 'live' | 'fallback' }
  | { ok: false; error: { kind: string; retryAfterMs?: number } }

function hasGenerationVersion(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && (value as Record<string, unknown>).v === GENERATION_PROTOCOL_VERSION
}

export function isGenerationPortMessage(value: unknown): value is GenerationPortInbound {
  if (!hasGenerationVersion(value)) return false
  if (value.type === 'CANCEL_GENERATION') return true
  return value.type === 'REQUEST_GENERATION' && 'request' in value && 'preferences' in value
}

export function isGenerationOneShotMessage(value: unknown): value is GenerationOneShotMessage {
  if (!hasGenerationVersion(value)) return false
  if (value.type === 'GET_PROVIDER_STATUS') return true
  if (value.type === 'RECORD_TRANSMISSION_CONSENT') {
    return typeof value.providerId === 'string' && value.providerId.length > 0
  }
  return (
    value.type === 'TEST_AND_LIST' &&
    typeof value.providerId === 'string' &&
    value.providerId.length > 0 &&
    typeof value.apiKey === 'string' &&
    value.apiKey.length > 0
  )
}

export function isGenerationResultMessage(value: unknown): value is GenerationResultMessage {
  if (!hasGenerationVersion(value) || value.type !== 'GENERATION_RESULT') return false
  if (value.ok === true) return typeof value.text === 'string'
  return value.ok === false && Boolean(value.error) && typeof (value.error as Record<string, unknown>).kind === 'string'
}
