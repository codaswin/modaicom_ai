import type { AIProvider } from '../types'
import { createAnthropicProvider } from './anthropic'
import { createOpenAiCompatibleProvider } from './openaiCompatible'
import type { ProviderPreset } from './preset'
import { OPENAI_PRESET, PROVIDER_PRESETS } from './presets'

// Provider identity is only ever a lookup key here — never a branch in the
// generation layer, the service worker, or the options page (ADR-0012). Four of
// the five providers are built from a preset by the shared transport; Anthropic
// slots in with its own adapter factory, same interface, same preset shape.
const ADAPTERS: Record<string, (preset: ProviderPreset) => AIProvider> = {
  anthropic: createAnthropicProvider,
}

const PRESETS_BY_ID = new Map<string, ProviderPreset>(PROVIDER_PRESETS.map((preset) => [preset.id, preset]))
const PROVIDERS = new Map<string, AIProvider>(
  PROVIDER_PRESETS.map((preset) => [preset.id, (ADAPTERS[preset.id] ?? createOpenAiCompatibleProvider)(preset)]),
)

export function getProvider(id: string): AIProvider | undefined {
  return PROVIDERS.get(id)
}

export function getPreset(id: string): ProviderPreset | undefined {
  return PRESETS_BY_ID.get(id)
}

export { PROVIDER_PRESETS }

export const KNOWN_PROVIDER_IDS: readonly string[] = PROVIDER_PRESETS.map((preset) => preset.id)

// The provider selected before the user has chosen one, and the fallback the
// options page and status reads land on.
export const DEFAULT_PROVIDER_ID = OPENAI_PRESET.id
