// The registry's declarative Provider Presets (ADR-0012). Adding a provider that
// speaks the OpenAI wire protocol is a preset here plus a manifest host — no new
// transport, generation, or UI code.

import type { RawModelRecord } from './preset'
import type { ProviderPreset } from './preset'

// OpenAI `GET /models` -> `{ data: [{ id, object: 'model' }] }`. No capability
// metadata, so filtering is by ID pattern (brittle, isolated to this preset).
function parseOpenAiModels(body: unknown): RawModelRecord[] {
  const data = (body as { data?: unknown })?.data
  if (!Array.isArray(data)) return []
  return data
    .map((row) => (row as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => ({ id }))
}

export const OPENAI_PRESET: ProviderPreset = {
  id: 'openai',
  label: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  host: 'https://api.openai.com/*',
  keyAuth: 'bearer',
  listModels: { path: '/models', parse: parseOpenAiModels },
  modelFilter: {
    allow: [/gpt/, /^o\d/, /chatgpt/],
    deny: [/embedding/, /audio/, /realtime/, /transcribe/, /moderation/, /image/, /dall-e/, /tts/, /whisper/, /search/],
  },
  fallbackModels: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'o3-mini', label: 'o3-mini' },
  ],
}

// Groq speaks the OpenAI protocol exactly (`/openai/v1`). Its catalogue is all
// LLMs bar speech (`whisper`), TTS (`playai-tts`) and the Llama Guard safety
// classifiers — filtered by ID pattern.
export const GROQ_PRESET: ProviderPreset = {
  id: 'groq',
  label: 'Groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  host: 'https://api.groq.com/*',
  keyAuth: 'bearer',
  listModels: { path: '/models', parse: parseOpenAiModels },
  modelFilter: {
    deny: [/whisper/, /tts/, /guard/, /distil/, /playai/],
  },
  fallbackModels: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
    { id: 'qwen/qwen3-32b', label: 'Qwen3 32B' },
  ],
}

// xAI (Grok) — OpenAI-compatible `/v1`. Image-generation models are dropped;
// vision-capable chat models are kept (they also take text).
export const XAI_PRESET: ProviderPreset = {
  id: 'xai',
  label: 'xAI (Grok)',
  baseUrl: 'https://api.x.ai/v1',
  host: 'https://api.x.ai/*',
  keyAuth: 'bearer',
  listModels: { path: '/models', parse: parseOpenAiModels },
  modelFilter: {
    allow: [/grok/],
    deny: [/image/],
  },
  fallbackModels: [
    { id: 'grok-4', label: 'Grok 4' },
    { id: 'grok-3', label: 'Grok 3' },
    { id: 'grok-3-mini', label: 'Grok 3 mini' },
  ],
}

// Registration order = display order in the provider dropdown.
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [OPENAI_PRESET, GROQ_PRESET, XAI_PRESET]
