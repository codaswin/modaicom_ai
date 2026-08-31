import { useCallback, useState } from 'react'

import { RELAY_VERSION } from '../shared/relay'
import { isInsertFailureKind, type InsertFailureKind } from '../shared/protocol'

export type InsertState =
  | { phase: 'idle' }
  | { phase: 'inserting' }
  | { phase: 'done' }
  | { phase: 'error'; reason: InsertFailureKind }

export type InsertArgs = { text: string; sessionId: string; generation: number }

export type UseInsert = {
  state: InsertState
  insert: (args: InsertArgs) => void
  reset: () => void
}

// One-shot popup -> content-script insertion (chrome.tabs.sendMessage). Not a
// long-lived Port like useGeneration — a single request/response. The draft text
// never touches the service worker.
export function useInsert(): UseInsert {
  const [state, setState] = useState<InsertState>({ phase: 'idle' })

  const insert = useCallback(({ text, sessionId, generation }: InsertArgs) => {
    setState({ phase: 'inserting' })
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (typeof tab?.id !== 'number') {
          setState({ phase: 'error', reason: 'wrong-tab' })
          return
        }
        const reply: unknown = await chrome.tabs.sendMessage(tab.id, {
          version: RELAY_VERSION,
          type: 'INSERT_DRAFT',
          text,
          sessionId,
          generation,
        })
        if (reply && typeof reply === 'object' && (reply as { ok?: unknown }).ok === true) {
          setState({ phase: 'done' })
          return
        }
        const reason = (reply as { reason?: unknown } | undefined)?.reason
        setState({ phase: 'error', reason: isInsertFailureKind(reason) ? reason : 'insert-failed' })
      } catch {
        // No content script listening / tab gone / not a LinkedIn page.
        setState({ phase: 'error', reason: 'wrong-tab' })
      }
    })()
  }, [])

  const reset = useCallback(() => setState({ phase: 'idle' }), [])

  return { state, insert, reset }
}
