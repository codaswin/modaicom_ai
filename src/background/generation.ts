import { runGeneration } from '../features/generation/generate'
import { isGenerationRequest } from '../features/generation/generationRequest'
import { isGenerationPreferences } from '../features/generation/preferences'
import { getPreset, getProvider, KNOWN_PROVIDER_IDS } from '../features/generation/providers/registry'
import type { GenerationError, GenerationResult } from '../features/generation/types'
import {
  type ConnectionTestResult,
  GENERATION_PORT_NAME,
  GENERATION_PROTOCOL_VERSION,
  isGenerationOneShotMessage,
  isGenerationPortMessage,
  type GenerationResultMessage,
} from '../shared/protocol'
import { readActiveConfig, readApiKey, readConsent, readProviderStatus, writeConsent } from './keyStore'

const GENERATION_TIMEOUT_MS = 30_000

// The host grant is optional (ADR-0008); without it the SW fetch cannot reach
// the provider, which surfaces as `provider-not-configured` with an
// options-page sub-message. The match pattern is preset data (ADR-0012).

// At most one generation in flight (one action popup, one Port). A fresh Port
// supersedes and aborts the old.
let active: { port: chrome.runtime.Port; controller: AbortController } | undefined

// Accept the popup and the options page (the options page opens in a real tab,
// so `sender.tab` is set — the reliable signal is the origin). Reject content
// scripts, which report the web page's http(s) origin / URL. (ADR-0008)
function isExtensionPage(sender: chrome.runtime.MessageSender | undefined): boolean {
  if (!sender || sender.id !== chrome.runtime.id) return false
  if (sender.url && !sender.url.startsWith('chrome-extension://')) return false
  if (sender.origin && sender.origin !== `chrome-extension://${chrome.runtime.id}`) return false
  return true
}

function resultMessage(result: GenerationResult): GenerationResultMessage {
  return result.ok
    ? { v: GENERATION_PROTOCOL_VERSION, type: 'GENERATION_RESULT', ok: true, text: result.text }
    : { v: GENERATION_PROTOCOL_VERSION, type: 'GENERATION_RESULT', ok: false, error: result.error }
}

function errorResult(kind: GenerationError['kind']): GenerationResult {
  return { ok: false, error: { kind } }
}

// Snapshots the active provider/model/key/consent once at kickoff. A config
// change made mid-generation lands on the next Generate, never this one (ADR-0012).
async function preflight(): Promise<GenerationResult | { model: string; providerId: string; apiKey: string }> {
  const config = await readActiveConfig()
  if (!config || !KNOWN_PROVIDER_IDS.includes(config.providerId)) return errorResult('provider-not-configured')
  const host = getPreset(config.providerId)?.host
  if (host) {
    const granted = await chrome.permissions.contains({ origins: [host] }).catch(() => false)
    if (!granted) return errorResult('provider-not-configured')
  }
  const apiKey = await readApiKey(config.providerId)
  if (!apiKey) return errorResult('api-key-missing')
  const consent = await readConsent(config.providerId)
  if (!consent) return errorResult('transmission-not-consented')
  return { model: config.model, providerId: config.providerId, apiKey }
}

// TEST_AND_LIST: validate the key against the selected provider and return its
// models, in one zero-token metadata round trip. The key is used for this call
// only and never persisted here (ADR-0008 amendment).
async function testAndList(providerId: string, apiKey: string): Promise<ConnectionTestResult> {
  const provider = getProvider(providerId)
  const preset = getPreset(providerId)
  if (!provider || !preset) return { ok: false, error: { kind: 'provider-not-configured' } }
  let result
  try {
    result = await provider.listModels({ apiKey, signal: composeAbortSignal(new AbortController()) })
  } catch {
    return { ok: false, error: { kind: 'provider-error' } }
  }
  if (!result.ok) return { ok: false, error: result.error }
  // A 200 that yielded no usable models: the key is valid, show the curated list.
  if (result.models.length === 0) return { ok: true, models: [...preset.fallbackModels], modelSource: 'fallback' }
  return { ok: true, models: result.models, modelSource: 'live' }
}

function composeAbortSignal(controller: AbortController): AbortSignal {
  const timeout = AbortSignal.timeout(GENERATION_TIMEOUT_MS)
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([controller.signal, timeout]) : timeout
}

async function generate(request: unknown, preferences: unknown, signal: AbortSignal): Promise<GenerationResult> {
  if (!isGenerationRequest(request)) return errorResult('invalid-response')
  // The message boundary rejects an unknown/malformed selection with a typed
  // error (ADR-0010) — never a silent default. The popup always sends a valid
  // triple, so this fires only on a bug or a version skew.
  if (!isGenerationPreferences(preferences)) return errorResult('invalid-preferences')
  const pf = await preflight()
  if ('ok' in pf) return pf
  return runGeneration(request, preferences, { ...pf, signal })
}

function handlePort(port: chrome.runtime.Port): void {
  if (port.name !== GENERATION_PORT_NAME) return
  if (!isExtensionPage(port.sender)) {
    port.disconnect()
    return
  }

  active?.controller.abort('superseded')
  active?.port.disconnect()

  const controller = new AbortController()
  const session = { port, controller }
  active = session
  // One request per port: the popup opens a fresh port per Generate/Regenerate.
  // A second REQUEST_GENERATION on the same port is ignored.
  let requested = false

  const finish = () => {
    if (active === session) active = undefined
  }

  port.onDisconnect.addListener(() => {
    controller.abort('port-disconnect')
    finish()
  })

  port.onMessage.addListener((message: unknown) => {
    if (!isGenerationPortMessage(message)) return
    if (message.type === 'CANCEL_GENERATION') {
      controller.abort('cancelled')
      return
    }
    if (requested) return
    requested = true
    void generate(message.request, message.preferences, composeAbortSignal(controller))
      .then((result) => {
        try {
          port.postMessage(resultMessage(result))
        } catch {
          // popup gone
        }
      })
      .finally(finish)
  })
}

async function handleOneShot(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (!isGenerationOneShotMessage(message) || !isExtensionPage(sender)) return undefined
  if (message.type === 'GET_PROVIDER_STATUS') return readProviderStatus()
  if (message.type === 'RECORD_TRANSMISSION_CONSENT') {
    await writeConsent(message.providerId)
    return { ok: true }
  }
  return testAndList(message.providerId, message.apiKey)
}

export function registerGenerationHandlers(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime) return
  chrome.runtime.onConnect.addListener(handlePort)
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isGenerationOneShotMessage(message)) return false
    void handleOneShot(message, sender).then(sendResponse, () => sendResponse(undefined))
    return true
  })
}

export { generate as runGenerationForTest, handleOneShot as handleOneShotForTest, isExtensionPage }
