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
  // Phase 9 (ADR-0012): a generation-time 404 / model-not-found. Non-retryable —
  // the popup routes it to settings, where the user picks another model.
  | 'model-not-available'

export type GenerationError = { kind: GenerationErrorKind; retryAfterMs?: number }

// The provider-neutral model input the generation layer builds. The provider
// maps this onto its own API shape.
export type GenerationInput = { system: string; user: string }

export type GenerateOptions = {
  model: string
  apiKey: string
  signal: AbortSignal
  // Provider-neutral sampling knobs (ADR-0010). `maxTokens` is a cost / runaway
  // backstop, not the length mechanism (that is the prompt). A provider maps
  // these onto its own field names.
  temperature?: number
  maxTokens?: number
}

// The endpoint is no longer a runtime option — it comes from the provider's
// registry preset (ADR-0012). `listModels` and `generate` share this shape.
export type ListModelsOptions = {
  apiKey: string
  signal: AbortSignal
}

export type GenerationResult = { ok: true; text: string } | { ok: false; error: GenerationError }

// A model the user can pick. `id` is the stable string the provider's `model`
// field wants and the only value ever persisted or sent; `label` is a
// display-only friendly name, recomputed each list load (ADR-0012).
export type ModelInfo = { id: string; label?: string }

export type ModelListResult = { ok: true; models: ModelInfo[] } | { ok: false; error: GenerationError }

export interface AIProvider {
  readonly id: string
  generate(input: GenerationInput, opts: GenerateOptions): Promise<GenerationResult>
  listModels(opts: ListModelsOptions): Promise<ModelListResult>
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
  'model-not-available',
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
