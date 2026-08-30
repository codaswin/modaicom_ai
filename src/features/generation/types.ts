// Provider-neutral generation types (Phase 5). No LinkedIn type enters this
// layer; no provider type (HTTP status, response body, raw exception) leaves it.

export type GenerationErrorKind =
  | 'provider-not-configured'
  | 'api-key-missing'
  | 'transmission-not-consented'
  | 'invalid-preferences'
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
  // Provider-neutral sampling knobs (ADR-0010). `maxTokens` is a cost / runaway
  // backstop, not the length mechanism (that is the prompt). A provider maps
  // these onto its own field names.
  temperature?: number
  maxTokens?: number
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
  'invalid-preferences',
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
  // The popup's stored preferences are always a valid typed triple (validated on
  // read, with a default fallback), so this only occurs on transient protocol
  // skew during an extension update — where retrying after the reload works.
  'invalid-preferences',
])

export function isRetryableGenerationError(kind: GenerationErrorKind): boolean {
  return RETRYABLE.has(kind)
}

export function isGenerationErrorKind(value: unknown): value is GenerationErrorKind {
  return typeof value === 'string' && (GENERATION_ERROR_KINDS as readonly string[]).includes(value)
}
