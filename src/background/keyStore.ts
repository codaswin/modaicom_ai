// Provider credential + configuration + transmission consent (Phase 5).
//
// chrome.storage.local ONLY — never chrome.storage.sync (a synced bearer
// credential would replicate to Google infrastructure and every device). See
// ADR-0008. This module is imported only by src/background/ (read) and
// src/options/ (write); the eslint boundary rule enforces that the content
// script and popup bundles never touch it.

const API_KEY_PREFIX = 'modaicom.provider.'
const CONFIG_KEY = 'modaicom.provider.config'
const CONSENT_KEY = 'modaicom.provider.consent'

export type ProviderConfig = { providerId: string; model: string; baseUrl?: string }
export type TransmissionConsent = { providerId: string; consentedAt: number }

function apiKeyStorageKey(providerId: string): string {
  return `${API_KEY_PREFIX}${providerId}.apiKey`
}

export async function readApiKey(providerId: string): Promise<string | undefined> {
  const storageKey = apiKeyStorageKey(providerId)
  const value = (await chrome.storage.local.get(storageKey))[storageKey]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export async function writeApiKey(providerId: string, apiKey: string): Promise<void> {
  await chrome.storage.local.set({ [apiKeyStorageKey(providerId)]: apiKey })
}

export async function clearApiKey(providerId: string): Promise<void> {
  await chrome.storage.local.remove(apiKeyStorageKey(providerId))
}

export function isProviderConfig(value: unknown): value is ProviderConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.providerId === 'string' &&
    candidate.providerId.length > 0 &&
    typeof candidate.model === 'string' &&
    candidate.model.length > 0 &&
    (candidate.baseUrl === undefined || (typeof candidate.baseUrl === 'string' && candidate.baseUrl.length > 0))
  )
}

export async function readProviderConfig(): Promise<ProviderConfig | undefined> {
  const value = (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY]
  return isProviderConfig(value) ? value : undefined
}

export async function writeProviderConfig(config: ProviderConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config })
}

export function isTransmissionConsent(value: unknown): value is TransmissionConsent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.providerId === 'string' &&
    candidate.providerId.length > 0 &&
    typeof candidate.consentedAt === 'number' &&
    Number.isFinite(candidate.consentedAt)
  )
}

export async function readTransmissionConsent(): Promise<TransmissionConsent | undefined> {
  const value = (await chrome.storage.local.get(CONSENT_KEY))[CONSENT_KEY]
  return isTransmissionConsent(value) ? value : undefined
}

export async function writeTransmissionConsent(providerId: string): Promise<void> {
  const record: TransmissionConsent = { providerId, consentedAt: Date.now() }
  await chrome.storage.local.set({ [CONSENT_KEY]: record })
}

export type ProviderStatus = {
  configured: boolean
  providerId?: string
  model?: string
  consented: boolean
}

// Non-secret status for the popup / options page. Never includes the key or any
// derivative of it.
export async function readProviderStatus(): Promise<ProviderStatus> {
  const config = await readProviderConfig()
  if (!config) return { configured: false, consented: false }
  const [key, consent] = await Promise.all([readApiKey(config.providerId), readTransmissionConsent()])
  return {
    configured: Boolean(key),
    providerId: config.providerId,
    model: config.model,
    consented: consent?.providerId === config.providerId,
  }
}
