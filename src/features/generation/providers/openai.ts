import type { AIProvider, GenerateOptions, GenerationError, GenerationInput, GenerationResult } from '../types'

// OpenAI Chat Completions — also the shape the OpenAI-compatible ecosystem
// (Groq, OpenRouter, Ollama, LM Studio, Together) mirrors, so this module later
// serves them via `baseUrl` presets. Non-streaming. See ADR-0007.
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export const openaiProvider: AIProvider = {
  id: 'openai',
  async generate(input: GenerationInput, opts: GenerateOptions): Promise<GenerationResult> {
    const base = (opts.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
    const url = `${base}/chat/completions`

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.apiKey}`,
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

    if (!response.ok) {
      return { ok: false, error: mapHttpError(response) }
    }

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
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function abortErrorFor(signal: AbortSignal): GenerationError {
  const reason = signal.reason as { name?: unknown } | undefined
  return reason && reason.name === 'TimeoutError' ? { kind: 'request-timeout' } : { kind: 'generation-cancelled' }
}

function mapHttpError(response: Response): GenerationError {
  if (response.status === 401 || response.status === 403) return { kind: 'authentication-failed' }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after'))
    return Number.isFinite(seconds) && seconds > 0
      ? { kind: 'rate-limited', retryAfterMs: Math.round(seconds * 1000) }
      : { kind: 'rate-limited' }
  }
  return { kind: 'provider-error' }
}

function extractText(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const choices = (body as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return undefined
  const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content
  return typeof content === 'string' && content.trim() ? content.trim() : undefined
}
