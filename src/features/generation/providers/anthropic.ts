import type {
  AIProvider,
  GenerateOptions,
  GenerationInput,
  GenerationResult,
  ListModelsOptions,
  ModelInfo,
  ModelListResult,
} from '../types'
import { modelFilter } from './modelFilter'
import type { ProviderPreset } from './preset'
import { abortErrorFor, isAbortError, mapHttpError, resolveListUrl, stripTrailingSlash } from './providerHttp'

// The one genuinely different provider (ADR-0012): x-api-key + anthropic-version
// auth, POST /v1/messages with a top-level `system`, a REQUIRED `max_tokens`,
// and a `content[]` response. It implements the same AIProvider interface and
// maps its HTTP reality onto the same GenerationError union as the shared
// transport. Non-streaming. The key never leaves the service worker (ADR-0008).

const ANTHROPIC_VERSION = '2023-06-01'
// Messages requires max_tokens; generation always passes a length-derived value,
// this is only the floor for a caller that omits it (e.g. a bare test).
const DEFAULT_MAX_TOKENS = 1024

function headers(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    // Required for calls from a browser extension origin.
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

// `content` is an array of typed blocks; concatenate the text blocks. A
// `stop_reason` of `max_tokens` with non-empty text is a truncated draft, not an
// error (Phase 7 truncation policy).
function extractText(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const content = (body as { content?: unknown }).content
  if (!Array.isArray(content)) return undefined
  const text = content
    .filter((block): block is { type: string; text: string } => {
      const b = block as { type?: unknown; text?: unknown }
      return b.type === 'text' && typeof b.text === 'string'
    })
    .map((block) => block.text)
    .join('')
    .trim()
  return text ? text : undefined
}

export function createAnthropicProvider(preset: ProviderPreset): AIProvider {
  const base = stripTrailingSlash(preset.baseUrl)
  return {
    id: preset.id,

    async generate(input: GenerationInput, opts: GenerateOptions): Promise<GenerationResult> {
      let response: Response
      try {
        response = await fetch(`${base}/messages`, {
          method: 'POST',
          headers: headers(opts.apiKey),
          body: JSON.stringify({
            model: opts.model,
            system: input.system,
            messages: [{ role: 'user', content: input.user }],
            max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
            // TEMPERATURE = 0.6 is valid here; Anthropic rejects > 1.0.
            ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
          }),
          signal: opts.signal,
        })
      } catch (error) {
        if (isAbortError(error)) return { ok: false, error: abortErrorFor(opts.signal) }
        return { ok: false, error: { kind: 'network-error' } }
      }

      if (!response.ok) return { ok: false, error: mapHttpError(response) }

      let body: unknown
      try {
        body = await response.json()
      } catch {
        return { ok: false, error: { kind: 'invalid-response' } }
      }

      const text = extractText(body)
      if (!text) return { ok: false, error: { kind: 'invalid-response' } }
      return { ok: true, text }
    },

    async listModels(opts: ListModelsOptions): Promise<ModelListResult> {
      let response: Response
      try {
        response = await fetch(resolveListUrl(base, preset.listModels.path), {
          method: 'GET',
          headers: headers(opts.apiKey),
          signal: opts.signal,
        })
      } catch (error) {
        if (isAbortError(error)) return { ok: false, error: abortErrorFor(opts.signal) }
        return { ok: false, error: { kind: 'network-error' } }
      }

      if (!response.ok) return { ok: false, error: mapHttpError(response, 'list') }

      let models: ModelInfo[]
      try {
        const body: unknown = await response.json()
        models = modelFilter(preset.listModels.parse(body), preset.modelFilter)
      } catch {
        models = []
      }
      return { ok: true, models }
    },
  }
}
