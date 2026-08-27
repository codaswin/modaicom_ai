import { useEffect, useState } from 'react'

import {
  detectCurrentPage,
  type DetectionResult,
} from '../features/linkedin-detection/detectCurrentPage'
import {
  extractCurrentPostContext,
  type PostExtractionResult,
} from '../features/linkedin-context/extractPostContext'
import './popup.css'

type PopupState = DetectionResult['kind'] | 'loading'
type ContextState = PostExtractionResult | { kind: 'context-loading' }

const statePresentation = {
  loading: {
    icon: '◌',
    message: 'Checking current page…',
    canRetry: false,
  },
  linkedin: {
    icon: '✓',
    message: 'LinkedIn detected ✓',
    canRetry: false,
  },
  other: {
    icon: '↗',
    message: 'Open LinkedIn to use modaicom.',
    canRetry: false,
  },
  error: {
    icon: '!',
    message: 'Unable to detect the current page. Try again.',
    canRetry: true,
  },
} satisfies Record<
  PopupState,
  { icon: string; message: string; canRetry: boolean }
>

const contextMessages = {
  'unsupported-surface': 'Open an individual LinkedIn post to extract context.',
  'post-not-found': 'No LinkedIn post was found on this page. Try again.',
  'ambiguous-post':
    'Multiple LinkedIn posts were found. Open one individual post, then Retry.',
  'collapsed-post':
    'This post is collapsed. Expand “see more” on LinkedIn, then Retry.',
  'no-text': 'No original post text was found. Try again if LinkedIn is still loading.',
  'author-not-found': 'The post author could not be found. Try again.',
  'unexpected-error': 'Unable to extract this post. Try again.',
} satisfies Record<Exclude<PostExtractionResult['kind'], 'success'>, string>

function loadPage(): Promise<DetectionResult> {
  return detectCurrentPage()
}

export function Popup() {
  const [result, setResult] = useState<DetectionResult | null>(null)
  const [contextResult, setContextResult] = useState<ContextState | null>(null)

  const load = async () => {
    await Promise.resolve()
    setResult(null)
    setContextResult(null)
    const detection = await loadPage()
    setResult(detection)
    if (detection.kind === 'linkedin') {
      setContextResult({ kind: 'context-loading' })
      setContextResult(await extractCurrentPostContext())
    }
  }

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [])

  const state: PopupState = result?.kind ?? 'loading'
  const presentation = statePresentation[state]
  const context = state === 'linkedin' ? contextResult : null
  const canRetryContext =
    context?.kind === 'collapsed-post' ||
    context?.kind === 'post-not-found' ||
    context?.kind === 'ambiguous-post' ||
    context?.kind === 'no-text' ||
    context?.kind === 'author-not-found' ||
    context?.kind === 'unexpected-error'

  return (
    <main className="popup">
      <header className="popup__header">
        <span className="popup__brand-mark" aria-hidden="true">
          m
        </span>
        <h1>modaicom</h1>
      </header>
      <div
        className={`status status--${state}`}
        role="status"
        aria-live="polite"
      >
        <span className="status__icon" aria-hidden="true">
          {presentation.icon}
        </span>
        <span className="status__message">{presentation.message}</span>
      </div>
      {presentation.canRetry ? (
        <button className="retry-button" onClick={load}>
          Retry
        </button>
      ) : null}
      {context ? (
        <section className="context-panel" aria-label="LinkedIn post context">
          {context.kind === 'context-loading' ? (
            <p className="context-panel__message">Reading LinkedIn post…</p>
          ) : context.kind === 'success' ? (
            <>
              <p className="context-panel__author">{context.context.authorDisplayName}</p>
              <p className="context-panel__text">{context.context.originalAuthoredText}</p>
              {context.context.authorHeadline ? (
                <p className="context-panel__metadata">{context.context.authorHeadline}</p>
              ) : null}
              {context.context.publicationTimeLabel ? (
                <p className="context-panel__metadata">
                  {context.context.publicationTimeLabel}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="context-panel__message">{contextMessages[context.kind]}</p>
              {canRetryContext ? (
                <button className="retry-button" onClick={load}>
                  Retry
                </button>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </main>
  )
}
