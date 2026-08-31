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

// Anthropic `GET /v1/models` -> `{ data: [{ id, display_name }] }`. The list is
// all chat models, so the filter is a near-passthrough. The dedicated adapter
// (`anthropic.ts`) reads this preset for its base URL, list shape, and fallback
// list; only `generate` diverges (Messages API).
function parseAnthropicModels(body: unknown): RawModelRecord[] {
  const data = (body as { data?: unknown })?.data
  if (!Array.isArray(data)) return []
  return data
    .filter((row): row is { id: string; display_name?: string } => typeof (row as { id?: unknown }).id === 'string')
    .map((row) => (row.display_name ? { id: row.id, label: row.display_name } : { id: row.id }))
}

export const ANTHROPIC_PRESET: ProviderPreset = {
  id: 'anthropic',
  label: 'Anthropic',
  baseUrl: 'https://api.anthropic.com/v1',
  host: 'https://api.anthropic.com/*',
  keyAuth: 'x-api-key',
  listModels: { path: '/models', parse: parseAnthropicModels },
  modelFilter: {},
  fallbackModels: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { id: 'claude-3-5-haiku-latest', label: 'Claude Haiku 3.5' },
  ],
}

// Gemini generates through its OpenAI-compatibility endpoint (shared transport)
// but lists and tests through its NATIVE endpoint — only the native list carries
// `supportedGenerationMethods` and `displayName`, which is what filtering needs.
// `name` is `models/<id>`; the prefix is stripped so the persisted value is the
// bare stable id the API's `model` field wants.
function parseGeminiModels(body: unknown): RawModelRecord[] {
  const models = (body as { models?: unknown })?.models
  if (!Array.isArray(models)) return []
  return models
    .filter((row): row is { name: string; displayName?: string; supportedGenerationMethods?: string[] } =>
      typeof (row as { name?: unknown }).name === 'string',
    )
    .map((row) => ({
      id: row.name.replace(/^models\//, ''),
      ...(row.displayName ? { label: row.displayName } : {}),
      methods: Array.isArray(row.supportedGenerationMethods) ? row.supportedGenerationMethods : [],
    }))
}

export const GEMINI_PRESET: ProviderPreset = {
  id: 'gemini',
  label: 'Google Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  host: 'https://generativelanguage.googleapis.com/*',
  keyAuth: 'bearer',
  listModels: {
    path: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    keyAuth: 'x-goog-api-key',
    parse: parseGeminiModels,
  },
  modelFilter: { requireMethod: 'generateContent', deny: [/embedding/, /aqa/, /gemma/] },
  fallbackModels: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ],
}

// Registration order = display order in the provider dropdown.
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  OPENAI_PRESET,
  GROQ_PRESET,
  XAI_PRESET,
  ANTHROPIC_PRESET,
  GEMINI_PRESET,
]
