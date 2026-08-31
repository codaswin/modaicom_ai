import { runGeneration } from '../features/generation/generate'
import { isGenerationRequest } from '../features/generation/generationRequest'
import { DEFAULT_GENERATION_PREFERENCES, isGenerationPreferences } from '../features/generation/preferences'
import { KNOWN_PROVIDER_IDS } from '../features/generation/providers/registry'
import type { GenerationError, GenerationResult } from '../features/generation/types'
import {
  GENERATION_PORT_NAME,
  GENERATION_PROTOCOL_VERSION,
  isGenerationOneShotMessage,
  isGenerationPortMessage,
  type GenerationResultMessage,
} from '../shared/protocol'
import {
  readApiKey,
  readProviderConfig,
  readProviderStatus,
  readTransmissionConsent,
  writeTransmissionConsent,
} from './keyStore'

const GENERATION_TIMEOUT_MS = 30_000

// The host grant is optional (ADR-0008); without it the SW fetch cannot reach
// the provider, which surfaces as `provider-not-configured` with an
// options-page sub-message.
const PROVIDER_HOST: Record<string, string> = { openai: 'https://api.openai.com/*' }

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

async function preflight(): Promise<GenerationResult | { model: string; providerId: string; apiKey: string; baseUrl?: string }> {
  const config = await readProviderConfig()
  if (!config || !KNOWN_PROVIDER_IDS.includes(config.providerId)) return errorResult('provider-not-configured')
  const host = PROVIDER_HOST[config.providerId]
  if (host) {
    const granted = await chrome.permissions.contains({ origins: [host] }).catch(() => false)
    if (!granted) return errorResult('provider-not-configured')
  }
  const apiKey = await readApiKey(config.providerId)
  if (!apiKey) return errorResult('api-key-missing')
  const consent = await readTransmissionConsent()
  if (consent?.providerId !== config.providerId) return errorResult('transmission-not-consented')
  return { model: config.model, providerId: config.providerId, apiKey, baseUrl: config.baseUrl }
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
    await writeTransmissionConsent(message.providerId)
    return { ok: true }
  }
  // TEST_PROVIDER: a minimal generation with no LinkedIn content and the
  // default preference triple.
  try {
    const result = await generate(
      { interactionKind: 'post-comment', postText: 'ping' },
      DEFAULT_GENERATION_PREFERENCES,
      composeAbortSignal(new AbortController()),
    )
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  } catch {
    return { ok: false, error: { kind: 'provider-error' } }
  }
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
