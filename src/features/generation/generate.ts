import type { GenerationRequest } from './generationRequest'
import { preferencesToInstructions, type GenerationPreferences } from './preferences'
import { buildGenerationInput } from './prompt'
import { getProvider } from './providers/registry'
import type { GenerationResult } from './types'

// Provider-neutral orchestration: request + preferences -> input -> provider
// call. Knows the generation layer and the provider registry; knows nothing
// about chrome, storage, or LinkedIn DOM. The service worker supplies key /
// model / signal and has already validated `preferences`.
export async function runGeneration(
  request: GenerationRequest,
  preferences: GenerationPreferences,
  opts: { providerId: string; model: string; apiKey: string; baseUrl?: string; signal: AbortSignal },
): Promise<GenerationResult> {
  const provider = getProvider(opts.providerId)
  if (!provider) return { ok: false, error: { kind: 'provider-not-configured' } }
  const input = buildGenerationInput(request, preferencesToInstructions(preferences))
  return provider.generate(input, {
    model: opts.model,
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    signal: opts.signal,
  })
}
