import type { AIProvider } from '../types'
import { openaiProvider } from './openai'

const PROVIDERS: Record<string, AIProvider> = {
  [openaiProvider.id]: openaiProvider,
}

export function getProvider(id: string): AIProvider | undefined {
  return PROVIDERS[id]
}

export const KNOWN_PROVIDER_IDS: readonly string[] = Object.keys(PROVIDERS)

export const DEFAULT_PROVIDER_ID = openaiProvider.id
// Pinned against OpenAI's current availability at implementation time; edit here
// and in the options-page default together.
export const DEFAULT_MODEL = 'gpt-4o-mini'
