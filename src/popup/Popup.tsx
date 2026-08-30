import { useCallback, useEffect, useState } from 'react'

import { detectCurrentPage, type DetectionResult } from '../features/linkedin-detection/detectCurrentPage'
import { requestPageInteractionContext } from '../features/linkedin-context/extractInteractionContext'
import { isInteractionExtractionResult, type InteractionExtractionResult, type LinkedInInteractionContext } from '../features/linkedin-context/interactionContext'
import type { ExtractedPostContext } from '../features/linkedin-context/extractPostContext'
import { isSupportedFeedUrl } from '../features/linkedin-context/routes'
import { RELAY_VERSION } from '../shared/relay'
import './popup.css'

type PopupState = DetectionResult['kind'] | 'loading'
type ContextState = InteractionExtractionResult | { kind: 'context-loading' }
type FailureKind = Exclude<InteractionExtractionResult['kind'], 'success'>

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
  'stale-target': 'That LinkedIn post changed or was removed. Try the modaicom trigger again.',
  'no-candidates': 'No selectable LinkedIn posts were found. Try again.',
  'ambiguous-candidates': 'LinkedIn posts could not be identified reliably. Try again.',
  'selection-failure': 'Unable to start selection on this page. Try again.',
  'comment-not-found': 'That comment could not be found. Try the modaicom trigger again.',
  'comment-author-not-found': 'The comment author could not be found. Try again.',
  'comment-no-text': 'No comment text was found. Try again if LinkedIn is still loading.',
  'comment-collapsed': 'This comment is collapsed. Expand it on LinkedIn, then Retry.',
  'comment-stale-target': 'That comment changed or was removed. Try the modaicom trigger again.',
  'ambiguous-target-comment': 'That reply could not be tied to one comment. Try the modaicom trigger again.',
} satisfies Record<FailureKind, string>

const retryableContextKinds = new Set<FailureKind>([
  'collapsed-post',
  'post-not-found',
  'ambiguous-post',
  'no-text',
  'author-not-found',
  'unexpected-error',
  'stale-target',
  'comment-not-found',
  'comment-author-not-found',
  'comment-no-text',
  'comment-collapsed',
  'comment-stale-target',
  'ambiguous-target-comment',
])

function PostView({ post, subhead }: { post: ExtractedPostContext; subhead?: string }) {
  return (
    <>
      {subhead ? <p className="context-panel__subhead">{subhead}</p> : null}
      <p className="context-panel__author">{post.authorDisplayName}</p>
      <p className="context-panel__text">{post.originalAuthoredText}</p>
      {post.authorHeadline ? <p className="context-panel__metadata">{post.authorHeadline}</p> : null}
      {post.publicationTimeLabel ? <p className="context-panel__metadata">{post.publicationTimeLabel}</p> : null}
    </>
  )
}

function InteractionView({ context }: { context: LinkedInInteractionContext }) {
  if (context.kind === 'post-comment') {
    return <PostView post={context.post} />
  }
  return (
    <>
      <p className="context-panel__reply-header">Replying in {context.targetComment.authorDisplayName}’s thread</p>
      <p className="context-panel__text">{context.targetComment.authoredText}</p>
      <section className="context-panel__owning-post" aria-label="On this post">
        <PostView post={context.post} subhead="On this post" />
      </section>
    </>
  )
}

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

  const readRelay = async (): Promise<InteractionExtractionResult | null> => {
    try {
      const relayResult: unknown = await chrome.runtime.sendMessage({ version: RELAY_VERSION, type: 'GET_LATEST_RELAY' })
      return isInteractionExtractionResult(relayResult) ? relayResult : null
    } catch {
      return null
    }
  }

  const load = useCallback(async () => {
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
    const relay = await readRelay()
    if (relay) {
      setContextResult(relay)
    } else if (feed) {
      setContextResult({ kind: 'unsupported-surface' })
    } else {
      setContextResult(await requestPageInteractionContext())
    }
  }, [])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const state: PopupState = result?.kind ?? 'loading'
  const presentation = statePresentation[state]
  const context = state === 'linkedin' ? contextResult : null
  const showNeutralFeed = Boolean(isFeed && context?.kind === 'unsupported-surface')
  const canRetryContext = Boolean(
    context && context.kind !== 'context-loading' && context.kind !== 'success' && !showNeutralFeed && retryableContextKinds.has(context.kind),
  )

  return (
    <main className="popup">
      <header className="popup__header"><span className="popup__brand-mark" aria-hidden="true">m</span><h1>modaicom</h1></header>
      <div className={`status status--${state}`} role="status" aria-live="polite"><span className="status__icon" aria-hidden="true">{presentation.icon}</span><span className="status__message">{presentation.message}</span></div>
      {presentation.canRetry ? <ActionButton label="Retry" onClick={load} /> : null}
      {context ? <section className="context-panel" aria-label="LinkedIn context">
        {context.kind === 'context-loading' ? <p className="context-panel__message">Reading LinkedIn context…</p> :
          context.kind === 'success' ? <InteractionView context={context.context} /> :
          <><p className="context-panel__message">{showNeutralFeed ? 'Select a LinkedIn post to continue.' : contextMessages[context.kind]}</p>{canRetryContext ? <ActionButton label="Retry" onClick={load} /> : null}</>}
      </section> : null}
    </main>
  )
}
