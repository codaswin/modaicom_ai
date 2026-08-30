import { runGeneration } from '../features/generation/generate'
import { isGenerationRequest } from '../features/generation/generationRequest'
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

function isExtensionPage(sender: chrome.runtime.MessageSender | undefined): boolean {
  return Boolean(sender && sender.id === chrome.runtime.id && sender.tab === undefined)
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

async function generate(request: unknown, signal: AbortSignal): Promise<GenerationResult> {
  if (!isGenerationRequest(request)) return errorResult('invalid-response')
  const pf = await preflight()
  if ('ok' in pf) return pf
  return runGeneration(request, { ...pf, signal })
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
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)])
    void generate(message.request, signal)
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
  // TEST_PROVIDER: a minimal generation with no LinkedIn content.
  const controller = new AbortController()
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)])
  const result = await generate({ interactionKind: 'post-comment', postText: 'ping' }, signal)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
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

export { generate as runGenerationForTest }
