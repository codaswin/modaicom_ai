// A Provider Preset is declarative data (ADR-0012). The shared OpenAI-compatible
// transport (`openaiCompatible.ts`) is parameterised entirely by one of these;
// provider identity is a lookup key, never a branch.

import type { ModelInfo } from '../types'

// How the API key is presented on a request.
export type KeyAuth = 'bearer' | 'x-api-key' | 'x-goog-api-key'

// A provider-neutral raw model record, produced by a preset's `listModels.parse`
// and consumed by the pure `modelFilter`. `methods` carries capability metadata
// where the provider supplies it (Gemini's `supportedGenerationMethods`);
// undefined for the ID-pattern-only lists (OpenAI-shaped).
export type RawModelRecord = { id: string; label?: string; methods?: readonly string[] }

// Declarative filter rules read by `modelFilter`. Keep a model when every
// supplied rule passes: it matches at least one `allow` pattern (if any), none
// of the `deny` patterns, and — if `requireMethod` is set — its `methods`
// include that method.
export type ModelFilterRules = {
  allow?: readonly RegExp[]
  deny?: readonly RegExp[]
  requireMethod?: string
}

export type ListModelsSpec = {
  // Appended to the preset `baseUrl` unless it is an absolute URL, in which case
  // it is used as-is (Gemini lists via its native endpoint, not the compat one).
  path: string
  // Overrides the preset `keyAuth` for the list call only (Gemini generates with
  // a bearer token but lists with `x-goog-api-key`).
  keyAuth?: KeyAuth
  // Raw JSON body -> provider-neutral records. Throwing or returning [] leaves
  // the caller to fall back to `fallbackModels`.
  parse: (body: unknown) => RawModelRecord[]
}

export type ProviderPreset = {
  id: string
  label: string
  baseUrl: string
  // `optional_host_permissions` match pattern for this provider's host.
  host: string
  keyAuth: KeyAuth
  listModels: ListModelsSpec
  modelFilter: ModelFilterRules
  // Shown only when a live list can't be fetched; will go stale — the manual
  // model-ID field is the real safety net (ADR-0012).
  fallbackModels: readonly ModelInfo[]
  // Reserved, unused escape hatch (ADR-0012): if a provider ever needs different
  // system-prompt placement, it becomes preset data, never a code branch.
  systemPromptStrategy?: 'inline-system'
}
