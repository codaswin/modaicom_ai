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
import type { KeyAuth, ProviderPreset } from './preset'
import { abortErrorFor, isAbortError, mapHttpError } from './providerHttp'

// The shared OpenAI-compatible transport (ADR-0012). `generate` and `listModels`
// are implemented once here and parameterised by a Provider Preset; OpenAI,
// Groq, xAI, and Gemini (generation only) all ride this module. Only Anthropic
// has its own adapter. Non-streaming. The key never leaves the service worker
// (ADR-0008).

function authHeaders(keyAuth: KeyAuth, apiKey: string): Record<string, string> {
  if (keyAuth === 'x-api-key') return { 'x-api-key': apiKey }
  if (keyAuth === 'x-goog-api-key') return { 'x-goog-api-key': apiKey }
  return { authorization: `Bearer ${apiKey}` }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function resolveListUrl(baseUrl: string, path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${stripTrailingSlash(baseUrl)}${path}`
}

function extractText(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const choices = (body as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return undefined
  const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content
  return typeof content === 'string' && content.trim() ? content.trim() : undefined
}

export function createOpenAiCompatibleProvider(preset: ProviderPreset): AIProvider {
  return {
    id: preset.id,

    async generate(input: GenerationInput, opts: GenerateOptions): Promise<GenerationResult> {
      const url = `${stripTrailingSlash(preset.baseUrl)}/chat/completions`
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...authHeaders(preset.keyAuth, opts.apiKey),
          },
          body: JSON.stringify({
            model: opts.model,
            messages: [
              { role: 'system', content: input.system },
              { role: 'user', content: input.user },
            ],
            ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
            ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
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
      const url = resolveListUrl(preset.baseUrl, preset.listModels.path)
      let response: Response
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: authHeaders(preset.listModels.keyAuth ?? preset.keyAuth, opts.apiKey),
          signal: opts.signal,
        })
      } catch (error) {
        if (isAbortError(error)) return { ok: false, error: abortErrorFor(opts.signal) }
        return { ok: false, error: { kind: 'network-error' } }
      }

      if (!response.ok) return { ok: false, error: mapHttpError(response, 'list') }

      // A 200 with an unparseable body or no usable models is not an error — the
      // caller falls back to the preset's curated list (ADR-0012).
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
