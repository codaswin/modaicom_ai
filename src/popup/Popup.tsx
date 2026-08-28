import { useEffect, useState } from 'react'

import {
  detectCurrentPage,
  type DetectionResult,
} from '../features/linkedin-detection/detectCurrentPage'
import {
  extractCurrentPostContext,
  type PostExtractionResult,
} from '../features/linkedin-context/extractPostContext'
import {
  extractSelectedFeedPost,
  isSupportedFeedUrl,
  startFeedSelection,
} from '../features/linkedin-context/feedTargeting'
import './popup.css'

type PopupState = DetectionResult['kind'] | 'loading'
type ContextState = PostExtractionResult | { kind: 'context-loading' | 'selection-active' }

type ActionButtonProps = { label: string; onClick: () => void }
function ActionButton({ label, onClick }: ActionButtonProps) {
  return <button className="retry-button" onClick={() => void onClick()}>{label}</button>
}

const statePresentation = {
  loading: { icon: '◌', message: 'Checking current page…', canRetry: false },
  linkedin: { icon: '✓', message: 'LinkedIn detected ✓', canRetry: false },
  other: { icon: '↗', message: 'Open LinkedIn to use modaicom.', canRetry: false },
  error: { icon: '!', message: 'Unable to detect the current page. Try again.', canRetry: true },
} satisfies Record<PopupState, { icon: string; message: string; canRetry: boolean }>

const contextMessages = {
  'unsupported-surface': 'Open an individual LinkedIn post to extract context.',
  'post-not-found': 'No LinkedIn post was found on this page. Try again.',
  'ambiguous-post': 'Multiple LinkedIn posts were found. Open one individual post, then Retry.',
  'collapsed-post': 'This post is collapsed. Expand “see more” on LinkedIn, then Retry.',
  'no-text': 'No original post text was found. Try again if LinkedIn is still loading.',
  'author-not-found': 'The post author could not be found. Try again.',
  'unexpected-error': 'Unable to extract this post. Try again.',
  cancelled: 'Select a LinkedIn post to continue.',
  'stale-target': 'That LinkedIn post changed or was removed. Start selection again.',
  'no-candidates': 'No selectable LinkedIn posts were found. Try again.',
  'ambiguous-candidates': 'LinkedIn posts could not be identified reliably. Try again.',
  'selection-failure': 'Unable to start selection on this page. Try again.',
} satisfies Record<Exclude<PostExtractionResult['kind'], 'success'>, string>

const retryableContextKinds = new Set<PostExtractionResult['kind']>([
  'collapsed-post',
  'post-not-found',
  'ambiguous-post',
  'no-text',
  'author-not-found',
  'unexpected-error',
  'stale-target',
])
const selectionRestartKinds = new Set<PostExtractionResult['kind']>([
  'unsupported-surface',
  'cancelled',
  'stale-target',
  'unexpected-error',
  'no-candidates',
  'ambiguous-candidates',
  'selection-failure',
])

export function Popup() {
  const [result, setResult] = useState<DetectionResult | null>(null)
  const [contextResult, setContextResult] = useState<ContextState | null>(null)
  const [isFeed, setIsFeed] = useState(false)

  const readActiveUrl = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      return tab?.url
    } catch {
      return undefined
    }
  }

  const load = async () => {
    setResult(null)
    setContextResult(null)
    setIsFeed(false)
    const detection = await detectCurrentPage()
    setResult(detection)
    if (detection.kind !== 'linkedin') return
    const activeUrl = await readActiveUrl()
    const feed = Boolean(activeUrl && isSupportedFeedUrl(activeUrl))
    setIsFeed(feed)
    setContextResult({ kind: 'context-loading' })
    setContextResult(feed ? await extractSelectedFeedPost() : await extractCurrentPostContext())
  }

  const beginSelection = async () => {
    setContextResult({ kind: 'context-loading' })
    const selection = await startFeedSelection()
    setContextResult(selection.kind === 'ready' ? { kind: 'selection-active' } : { kind: selection.kind })
  }

  useEffect(() => { void Promise.resolve().then(load) }, [])

  const state: PopupState = result?.kind ?? 'loading'
  const presentation = statePresentation[state]
  const context = state === 'linkedin' ? contextResult : null
  const canRetryContext = Boolean(context && retryableContextKinds.has(context.kind as PostExtractionResult['kind']))
  const showStartSelection = Boolean(isFeed && context && selectionRestartKinds.has(context.kind as PostExtractionResult['kind']))

  return (
    <main className="popup">
      <header className="popup__header"><span className="popup__brand-mark" aria-hidden="true">m</span><h1>modaicom</h1></header>
      <div className={`status status--${state}`} role="status" aria-live="polite"><span className="status__icon" aria-hidden="true">{presentation.icon}</span><span className="status__message">{presentation.message}</span></div>
      {presentation.canRetry ? <ActionButton label="Retry" onClick={load} /> : null}
      {context ? <section className="context-panel" aria-label="LinkedIn post context">
        {context.kind === 'context-loading' ? <p className="context-panel__message">Reading LinkedIn post…</p> :
          context.kind === 'selection-active' ? <p className="context-panel__message">Choose a post on LinkedIn, then reopen modaicom.</p> :
          context.kind === 'success' ? <><p className="context-panel__author">{context.context.authorDisplayName}</p><p className="context-panel__text">{context.context.originalAuthoredText}</p>{context.context.authorHeadline ? <p className="context-panel__metadata">{context.context.authorHeadline}</p> : null}{context.context.publicationTimeLabel ? <p className="context-panel__metadata">{context.context.publicationTimeLabel}</p> : null}</> :
          <><p className="context-panel__message">{showStartSelection && context.kind === 'unsupported-surface' ? 'Select a LinkedIn post to continue.' : contextMessages[context.kind]}</p>{showStartSelection ? <ActionButton label="Start selection" onClick={beginSelection} /> : canRetryContext ? <ActionButton label="Retry" onClick={load} /> : null}</>}
      </section> : null}
    </main>
  )
}
