// Provider-neutral generation types (Phase 5). No LinkedIn type enters this
// layer; no provider type (HTTP status, response body, raw exception) leaves it.

export type GenerationErrorKind =
  | 'provider-not-configured'
  | 'api-key-missing'
  | 'transmission-not-consented'
  | 'authentication-failed'
  | 'rate-limited'
  | 'request-timeout'
  | 'network-error'
  | 'provider-error'
  | 'invalid-response'
  | 'generation-cancelled'

export type GenerationError = { kind: GenerationErrorKind; retryAfterMs?: number }

// The provider-neutral model input the generation layer builds. The provider
// maps this onto its own API shape.
export type GenerationInput = { system: string; user: string }

export type GenerateOptions = {
  model: string
  apiKey: string
  baseUrl?: string
  signal: AbortSignal
}

export type GenerationResult = { ok: true; text: string } | { ok: false; error: GenerationError }

export interface AIProvider {
  readonly id: string
  generate(input: GenerationInput, opts: GenerateOptions): Promise<GenerationResult>
}

export const GENERATION_ERROR_KINDS: readonly GenerationErrorKind[] = [
  'provider-not-configured',
  'api-key-missing',
  'transmission-not-consented',
  'authentication-failed',
  'rate-limited',
  'request-timeout',
  'network-error',
  'provider-error',
  'invalid-response',
  'generation-cancelled',
]

const RETRYABLE = new Set<GenerationErrorKind>([
  'rate-limited',
  'request-timeout',
  'network-error',
  'provider-error',
  'invalid-response',
])

export function isRetryableGenerationError(kind: GenerationErrorKind): boolean {
  return RETRYABLE.has(kind)
}

export function isGenerationErrorKind(value: unknown): value is GenerationErrorKind {
  return typeof value === 'string' && (GENERATION_ERROR_KINDS as readonly string[]).includes(value)
}
