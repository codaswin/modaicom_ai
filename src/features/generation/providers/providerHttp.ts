// Shared HTTP -> GenerationError plumbing (ADR-0012). Every adapter — the
// OpenAI-compatible transport and the dedicated Anthropic adapter — maps its
// wire reality through these, so the error union stays identical across
// providers and a mapping fix is applied once. Response bodies are never
// surfaced (ADR-0008).

import type { GenerationError } from '../types'

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

export function abortErrorFor(signal: AbortSignal): GenerationError {
  const reason = signal.reason as { name?: unknown } | undefined
  return reason && reason.name === 'TimeoutError' ? { kind: 'request-timeout' } : { kind: 'generation-cancelled' }
}

// `context: 'list'` downgrades a 404 from `model-not-available` (a
// generation-time concept) to `provider-error` — a bad list route is not a
// missing model.
export function mapHttpError(response: Response, context: 'generate' | 'list' = 'generate'): GenerationError {
  if (response.status === 401 || response.status === 403) return { kind: 'authentication-failed' }
  if (response.status === 404) return context === 'list' ? { kind: 'provider-error' } : { kind: 'model-not-available' }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after'))
    return Number.isFinite(seconds) && seconds > 0
      ? { kind: 'rate-limited', retryAfterMs: Math.round(seconds * 1000) }
      : { kind: 'rate-limited' }
  }
  return { kind: 'provider-error' }
}
