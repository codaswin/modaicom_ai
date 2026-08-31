// Provider credential + per-provider configuration + transmission consent
// (Phase 5; per-provider layout in Phase 9 / ADR-0012).
//
// chrome.storage.local ONLY — never chrome.storage.sync (a synced bearer
// credential would replicate to Google infrastructure and every device). See
// ADR-0008. This module is imported only by src/background/ (read) and
// src/options/ (read + write); the eslint boundary rule enforces that the
// content script and popup bundles never touch it.

import type { ModelInfo } from '../features/generation/types'
import { DEFAULT_PROVIDER_ID, PROVIDER_PRESETS } from '../features/generation/providers/registry'

const NS = 'modaicom.provider.'
const ACTIVE_KEY = `${NS}active`

// v1.0.0 single-provider layout, migrated lazily on first read (ADR-0012).
const LEGACY_CONFIG_KEY = `${NS}config`
const LEGACY_CONSENT_KEY = `${NS}consent`

const MODELS_CACHE_TTL_MS = 24 * 60 * 60 * 1000

function apiKeyKey(id: string): string {
  return `${NS}${id}.apiKey`
}
function modelKey(id: string): string {
  return `${NS}${id}.model`
}
function consentKey(id: string): string {
  return `${NS}${id}.consent`
}
function modelsCacheKey(id: string): string {
  return `${NS}${id}.modelsCache`
}

async function get<T = unknown>(key: string): Promise<T | undefined> {
  return (await chrome.storage.local.get(key))[key] as T | undefined
}

// ---------------------------------------------------------------------------
// Lazy read-path migration from the v1.0.0 record.
// ---------------------------------------------------------------------------

type LegacyConfig = { providerId: string; model: string; baseUrl?: string }

function isLegacyConfig(value: unknown): value is LegacyConfig {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return typeof c.providerId === 'string' && c.providerId.length > 0 && typeof c.model === 'string' && c.model.length > 0
}

function normaliseBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

// A recognised custom baseUrl maps to its now-first-class provider; anything
// else keeps `openai` and drops the baseUrl (ADR-0012).
function providerForLegacyBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) return DEFAULT_PROVIDER_ID
  const target = normaliseBaseUrl(baseUrl)
  const match = PROVIDER_PRESETS.find((preset) => normaliseBaseUrl(preset.baseUrl) === target)
  return match?.id ?? DEFAULT_PROVIDER_ID
}

// Lazy and idempotent: once `active` is written (or the legacy record is gone)
// every subsequent call is a single cheap `get` that returns early. The
// in-flight promise dedupes concurrent service-worker callers so the key-remap
// branch's read/remove can't interleave with another caller's key read.
let migrationInFlight: Promise<void> | null = null

function migrateLegacyConfigOnce(): Promise<void> {
  if (!migrationInFlight) {
    migrationInFlight = runLegacyMigration().finally(() => {
      migrationInFlight = null
    })
  }
  return migrationInFlight
}

async function runLegacyMigration(): Promise<void> {
  if ((await get<string>(ACTIVE_KEY)) !== undefined) return
  const legacy = await get(LEGACY_CONFIG_KEY)
  if (!isLegacyConfig(legacy)) return

  const targetId = providerForLegacyBaseUrl(legacy.baseUrl)
  const writes: Record<string, unknown> = {
    [ACTIVE_KEY]: targetId,
    [modelKey(targetId)]: legacy.model,
  }

  // Move the key to the mapped provider's bucket if the baseUrl remapped it.
  if (targetId !== legacy.providerId) {
    const key = await get<string>(apiKeyKey(legacy.providerId))
    if (typeof key === 'string' && key.length > 0) {
      writes[apiKeyKey(targetId)] = key
      await chrome.storage.local.remove(apiKeyKey(legacy.providerId))
    }
  }

  const legacyConsent = await get(LEGACY_CONSENT_KEY)
  if (
    legacyConsent &&
    typeof legacyConsent === 'object' &&
    (legacyConsent as Record<string, unknown>).providerId === legacy.providerId &&
    typeof (legacyConsent as Record<string, unknown>).consentedAt === 'number'
  ) {
    writes[consentKey(targetId)] = { consentedAt: (legacyConsent as { consentedAt: number }).consentedAt }
  }

  await chrome.storage.local.set(writes)
  await chrome.storage.local.remove([LEGACY_CONFIG_KEY, LEGACY_CONSENT_KEY])
}

// ---------------------------------------------------------------------------
// Active provider
// ---------------------------------------------------------------------------

export async function readActiveProviderId(): Promise<string | undefined> {
  await migrateLegacyConfigOnce()
  const value = await get<string>(ACTIVE_KEY)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export async function writeActiveProviderId(id: string): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_KEY]: id })
}

// ---------------------------------------------------------------------------
// API key (location unchanged from Phase 5)
// ---------------------------------------------------------------------------

export async function readApiKey(providerId: string): Promise<string | undefined> {
  await migrateLegacyConfigOnce()
  const value = await get<string>(apiKeyKey(providerId))
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export async function writeApiKey(providerId: string, apiKey: string): Promise<void> {
  await chrome.storage.local.set({ [apiKeyKey(providerId)]: apiKey })
}

export async function clearApiKey(providerId: string): Promise<void> {
  await chrome.storage.local.remove(apiKeyKey(providerId))
}

export async function hasApiKey(providerId: string): Promise<boolean> {
  return (await readApiKey(providerId)) !== undefined
}

// ---------------------------------------------------------------------------
// Per-provider model
// ---------------------------------------------------------------------------

export async function readModel(providerId: string): Promise<string | undefined> {
  await migrateLegacyConfigOnce()
  const value = await get<string>(modelKey(providerId))
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export async function writeModel(providerId: string, model: string): Promise<void> {
  await chrome.storage.local.set({ [modelKey(providerId)]: model })
}

// ---------------------------------------------------------------------------
// Per-provider transmission consent (amends ADR-0007)
// ---------------------------------------------------------------------------

export type TransmissionConsent = { consentedAt: number }

function isConsent(value: unknown): value is TransmissionConsent {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).consentedAt === 'number' &&
    Number.isFinite((value as { consentedAt: number }).consentedAt)
  )
}

export async function readConsent(providerId: string): Promise<TransmissionConsent | undefined> {
  await migrateLegacyConfigOnce()
  const value = await get(consentKey(providerId))
  return isConsent(value) ? value : undefined
}

export async function writeConsent(providerId: string): Promise<void> {
  await chrome.storage.local.set({ [consentKey(providerId)]: { consentedAt: Date.now() } satisfies TransmissionConsent })
}

export async function clearConsent(providerId: string): Promise<void> {
  await chrome.storage.local.remove(consentKey(providerId))
}

// ---------------------------------------------------------------------------
// Short-TTL per-provider model-list cache (settings-page convenience only)
// ---------------------------------------------------------------------------

function isModelInfo(value: unknown): value is ModelInfo {
  if (!value || typeof value !== 'object') return false
  const m = value as Record<string, unknown>
  return typeof m.id === 'string' && m.id.length > 0 && (m.label === undefined || typeof m.label === 'string')
}

export async function readModelsCache(providerId: string): Promise<ModelInfo[] | undefined> {
  const value = await get<{ at?: unknown; models?: unknown }>(modelsCacheKey(providerId))
  if (!value || typeof value.at !== 'number' || !Array.isArray(value.models)) return undefined
  if (Date.now() - value.at > MODELS_CACHE_TTL_MS) return undefined
  if (!value.models.every(isModelInfo)) return undefined
  return value.models
}

export async function writeModelsCache(providerId: string, models: ModelInfo[]): Promise<void> {
  await chrome.storage.local.set({ [modelsCacheKey(providerId)]: { at: Date.now(), models } })
}

// ---------------------------------------------------------------------------
// Derived active config (what the generation preflight reads)
// ---------------------------------------------------------------------------

export type ActiveProviderConfig = { providerId: string; model: string }

export async function readActiveConfig(): Promise<ActiveProviderConfig | undefined> {
  const providerId = await readActiveProviderId()
  if (!providerId) return undefined
  const model = await readModel(providerId)
  if (!model) return undefined
  return { providerId, model }
}

// ---------------------------------------------------------------------------
// Non-secret summaries for the options page and popup
// ---------------------------------------------------------------------------

export type SetupSummary = {
  active: { providerId: string; model?: string }
  providers: Record<string, { hasKey: boolean; hasConsent: boolean }>
}

// No key value, ever — only booleans. The options page imports this directly
// (ADR-0008 permits options-page keyStore access).
export async function readSetupSummary(): Promise<SetupSummary> {
  await migrateLegacyConfigOnce()
  const activeId = (await readActiveProviderId()) ?? DEFAULT_PROVIDER_ID
  const providers: Record<string, { hasKey: boolean; hasConsent: boolean }> = {}
  for (const preset of PROVIDER_PRESETS) {
    providers[preset.id] = {
      hasKey: await hasApiKey(preset.id),
      hasConsent: (await readConsent(preset.id)) !== undefined,
    }
  }
  return { active: { providerId: activeId, model: await readModel(activeId) }, providers }
}

export type ProviderStatus = {
  configured: boolean
  providerId?: string
  providerLabel?: string
  model?: string
  consented: boolean
}

// Non-secret status for the popup. Never includes the key or any derivative.
export async function readProviderStatus(): Promise<ProviderStatus> {
  const config = await readActiveConfig()
  if (!config) return { configured: false, consented: false }
  const [key, consent] = await Promise.all([readApiKey(config.providerId), readConsent(config.providerId)])
  const preset = PROVIDER_PRESETS.find((p) => p.id === config.providerId)
  return {
    configured: Boolean(key),
    providerId: config.providerId,
    providerLabel: preset?.label,
    model: config.model,
    consented: consent !== undefined,
  }
}
