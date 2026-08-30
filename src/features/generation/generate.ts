import { buildGenerationInput } from './prompt'
import { getProvider } from './providers/registry'
import type { GenerationRequest } from './generationRequest'
import type { GenerationResult } from './types'

// Provider-neutral orchestration: request -> input -> provider call. Knows the
// generation layer and the provider registry; knows nothing about chrome,
// storage, or LinkedIn DOM. The service worker supplies key / model / signal.
export async function runGeneration(
  request: GenerationRequest,
  opts: { providerId: string; model: string; apiKey: string; baseUrl?: string; signal: AbortSignal },
): Promise<GenerationResult> {
  const provider = getProvider(opts.providerId)
  if (!provider) return { ok: false, error: { kind: 'provider-not-configured' } }
  return provider.generate(buildGenerationInput(request), {
    model: opts.model,
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    signal: opts.signal,
  })
}
