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
