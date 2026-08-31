import type { GenerationRequest } from './generationRequest'
import { preferencesToInstructions, type GenerationPreferences, type ResponseLength } from './preferences'
import { buildGenerationInput } from './prompt'
import { getProvider } from './providers/registry'
import type { GenerationResult } from './types'

// Lower than the provider default (~1.0), so the tone/intent/length instructions
// dominate the run-to-run variance — while leaving Regenerate a genuinely
// different draft. ADR-0010.
const TEMPERATURE = 0.6

// Cost / runaway backstop only — roughly 2x each length's sentence target, so
// normal output never truncates. Not the length mechanism (the prompt is).
const MAX_TOKENS_BY_LENGTH: Record<ResponseLength, number> = { short: 100, medium: 220, long: 380 }

// Provider-neutral orchestration: request + preferences -> input -> provider
// call. Knows the generation layer and the provider registry; knows nothing
// about chrome, storage, or LinkedIn DOM. The service worker supplies key /
// model / signal and has already validated `preferences`.
export async function runGeneration(
  request: GenerationRequest,
  preferences: GenerationPreferences,
  opts: { providerId: string; model: string; apiKey: string; signal: AbortSignal },
): Promise<GenerationResult> {
  const provider = getProvider(opts.providerId)
  if (!provider) return { ok: false, error: { kind: 'provider-not-configured' } }
  const input = buildGenerationInput(request, preferencesToInstructions(preferences))
  return provider.generate(input, {
    model: opts.model,
    apiKey: opts.apiKey,
    signal: opts.signal,
    temperature: TEMPERATURE,
    maxTokens: MAX_TOKENS_BY_LENGTH[preferences.length],
  })
}
