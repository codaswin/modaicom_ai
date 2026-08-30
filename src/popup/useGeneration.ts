import { useCallback, useEffect, useRef, useState } from 'react'

import type { GenerationRequest } from '../features/generation/generationRequest'
import type { GenerationPreferences } from '../features/generation/preferences'
import { isGenerationErrorKind, type GenerationErrorKind } from '../features/generation/types'
import {
  GENERATION_PORT_NAME,
  GENERATION_PROTOCOL_VERSION,
  isGenerationResultMessage,
} from '../shared/protocol'

// Popup-side safety net: if the service worker was killed and can never reply.
const POPUP_TIMEOUT_MS = 45_000

export type GenerationState =
  | { phase: 'idle' }
  | { phase: 'generating' }
  | { phase: 'done'; text: string }
  | { phase: 'error'; kind: GenerationErrorKind; retryAfterMs?: number }

export type UseGeneration = {
  state: GenerationState
  generate: (request: GenerationRequest, preferences: GenerationPreferences) => void
  cancel: () => void
  reset: () => void
}

export function useGeneration(): UseGeneration {
  const [state, setState] = useState<GenerationState>({ phase: 'idle' })
  const portRef = useRef<chrome.runtime.Port | null>(null)
  const timerRef = useRef<number | null>(null)

  const teardown = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (portRef.current) {
      portRef.current.disconnect()
      portRef.current = null
    }
  }, [])

  useEffect(() => teardown, [teardown])

  const generate = useCallback(
    (request: GenerationRequest, preferences: GenerationPreferences) => {
      teardown()
      setState({ phase: 'generating' })
      const port = chrome.runtime.connect({ name: GENERATION_PORT_NAME })
      portRef.current = port

      port.onMessage.addListener((message: unknown) => {
        if (!isGenerationResultMessage(message)) return
        teardown()
        if (message.ok) {
          setState({ phase: 'done', text: message.text })
        } else {
          const kind = isGenerationErrorKind(message.error.kind) ? message.error.kind : 'provider-error'
          setState({ phase: 'error', kind, retryAfterMs: message.error.retryAfterMs })
        }
      })

      port.onDisconnect.addListener(() => {
        // The SW disconnected (killed / superseded) without a result.
        if (portRef.current === port) portRef.current = null
        setState((current) => (current.phase === 'generating' ? { phase: 'error', kind: 'network-error' } : current))
      })

      port.postMessage({ v: GENERATION_PROTOCOL_VERSION, type: 'REQUEST_GENERATION', request, preferences })

      timerRef.current = window.setTimeout(() => {
        teardown()
        setState((current) => (current.phase === 'generating' ? { phase: 'error', kind: 'request-timeout' } : current))
      }, POPUP_TIMEOUT_MS)
    },
    [teardown],
  )

  const cancel = useCallback(() => {
    portRef.current?.postMessage({ v: GENERATION_PROTOCOL_VERSION, type: 'CANCEL_GENERATION' })
    teardown()
    setState({ phase: 'idle' })
  }, [teardown])

  const reset = useCallback(() => {
    teardown()
    setState({ phase: 'idle' })
  }, [teardown])

  return { state, generate, cancel, reset }
}
