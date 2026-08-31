import { useCallback, useEffect, useRef, useState } from 'react'

import { detectCurrentPage, type DetectionResult } from '../features/linkedin-detection/detectCurrentPage'
import { requestPageInteractionContext } from '../features/linkedin-context/extractInteractionContext'
import { isInteractionExtractionResult, type InteractionExtractionResult, type LinkedInInteractionContext } from '../features/linkedin-context/interactionContext'
import type { ExtractedPostContext } from '../features/linkedin-context/extractPostContext'
import { contextToGenerationRequest } from '../features/generation/generationRequest'
import {
  DEFAULT_GENERATION_PREFERENCES,
  INTENTS,
  LENGTHS,
  TONES,
  type GenerationPreferences,
} from '../features/generation/preferences'
import { isRetryableGenerationError, type GenerationErrorKind } from '../features/generation/types'
import { isSupportedFeedUrl } from '../features/linkedin-context/routes'
import { GENERATION_PROTOCOL_VERSION } from '../shared/protocol'
import { RELAY_VERSION } from '../shared/relay'
import { readPreferences, writePreferences } from './preferencesStore'
import { useGeneration, type UseGeneration } from './useGeneration'
import './popup.css'

type ProviderStatus = { configured: boolean; providerId?: string; model?: string; consented: boolean }
// `{ reachable: false }` means the GET_PROVIDER_STATUS round-trip to the service
// worker failed or came back malformed — distinct from a genuine
// not-configured / not-consented answer. The usual cause is a stale service
// worker after a protocol bump (reload the extension).
type ProviderStatusResult = ProviderStatus | { reachable: false }

function isProviderStatus(value: ProviderStatusResult | null): value is ProviderStatus {
  return value !== null && !('reachable' in value)
}

const generationErrorMessages = {
  'provider-not-configured': 'modaicom is not set up to reach an AI provider. Open settings.',
  'api-key-missing': 'No API key is configured. Open settings.',
  'transmission-not-consented': 'You have not yet consented to send LinkedIn text to your provider. Open settings.',
  'invalid-preferences': 'Your response controls could not be read. Reopen modaicom and Retry.',
  'authentication-failed': 'Your API key was rejected. Check it in settings.',
  'rate-limited': 'Your provider is rate-limiting requests. Wait a moment and Retry.',
  'request-timeout': 'The generation timed out. Retry.',
  'network-error': 'Could not reach your provider. Check your connection and Retry.',
  'provider-error': 'Your provider returned an error. Retry.',
  'invalid-response': 'The provider’s response was empty or unreadable. Retry.',
  'generation-cancelled': 'Generation cancelled.',
} satisfies Record<GenerationErrorKind, string>

function openOptions() {
  try {
    chrome.runtime.openOptionsPage()
  } catch {
    // options page not available in tests
  }
}

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

function DraftView({ text, onRegenerate }: { text: string; onRegenerate: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="draft">
      <label className="draft__label" htmlFor="modaicom-draft">Suggested draft</label>
      <textarea id="modaicom-draft" className="draft__text" readOnly value={text} rows={6} />
      <div className="draft__actions">
        <button className="retry-button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => setCopied(true)) }}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
        <button className="retry-button" onClick={onRegenerate}>Regenerate</button>
      </div>
    </div>
  )
}

type UsePreferences = {
  prefs: GenerationPreferences
  // false until the stored value has loaded (or the user has changed a control).
  // Generation is gated on this so an early click never sends the default over a
  // stored non-default choice (ADR-0010).
  ready: boolean
  update: (next: GenerationPreferences) => void
}

function usePreferences(): UsePreferences {
  const [prefs, setPrefs] = useState<GenerationPreferences>(DEFAULT_GENERATION_PREFERENCES)
  const [ready, setReady] = useState(false)
  // A user change before the stored value loads must win over the late load.
  const touched = useRef(false)
  useEffect(() => {
    let cancelled = false
    void readPreferences().then((loaded) => {
      if (cancelled) return
      if (!touched.current) setPrefs(loaded)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])
  const update = useCallback((next: GenerationPreferences) => {
    touched.current = true
    setPrefs(next)
    setReady(true)
    void writePreferences(next)
  }, [])
  return { prefs, ready, update }
}

const LENGTH_CAPTION_ID = 'modaicom-length-caption'

// The <select> only ever renders ids from `rows`, so `e.target.value` is always
// one of them; the cast is sound and keeps one code path per control.
function ControlSelect<Id extends string>({
  id,
  label,
  rows,
  value,
  describedBy,
  onSelect,
}: {
  id: string
  label: string
  rows: readonly { id: Id; label: string }[]
  value: Id
  describedBy?: string
  onSelect: (next: Id) => void
}) {
  return (
    <div className="controls__row">
      <label className="controls__label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="controls__select"
        value={value}
        aria-describedby={describedBy}
        onChange={(e) => onSelect(e.target.value as Id)}
      >
        {rows.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
      </select>
    </div>
  )
}

function ResponseControls({ prefs, update }: Pick<UsePreferences, 'prefs' | 'update'>) {
  return (
    <fieldset className="controls">
      <legend className="controls__legend">Response controls</legend>
      <ControlSelect
        id="modaicom-tone"
        label="Tone"
        rows={TONES}
        value={prefs.tone}
        onSelect={(tone) => update({ ...prefs, tone })}
      />
      <ControlSelect
        id="modaicom-intent"
        label="Intent"
        rows={INTENTS}
        value={prefs.intent}
        onSelect={(intent) => update({ ...prefs, intent })}
      />
      <ControlSelect
        id="modaicom-length"
        label="Length"
        rows={LENGTHS}
        value={prefs.length}
        describedBy={LENGTH_CAPTION_ID}
        onSelect={(length) => update({ ...prefs, length })}
      />
      <p id={LENGTH_CAPTION_ID} className="controls__caption">
        Short = a quick reply · Medium = a substantive comment · Long = a developed point
      </p>
      <p className="controls__hint">These guide your draft — you can still edit it before posting.</p>
    </fieldset>
  )
}

function GenerationPanel({
  context,
  status,
  gen,
  onRetryStatus,
}: {
  context: LinkedInInteractionContext
  status: ProviderStatusResult | null
  gen: UseGeneration
  onRetryStatus: () => void
}) {
  const preferences = usePreferences()
  const request = contextToGenerationRequest(context)
  // Only ever generates with the current, hydrated selection (ADR-0010).
  const run = () => {
    if (preferences.ready) gen.generate(request, preferences.prefs)
  }

  if (status !== null && !isProviderStatus(status)) {
    return (
      <div className="generation">
        <p className="generation__error">
          Couldn’t reach modaicom’s background worker. Reload the extension at chrome://extensions, then reopen this popup.
        </p>
        <button className="retry-button" onClick={onRetryStatus}>Retry</button>
      </div>
    )
  }

  const ready = Boolean(status?.configured && status?.consented)
  if (!ready) {
    return (
      <div className="generation">
        <p className="generation__hint">
          {status?.configured
            ? 'One more step: consent to sending LinkedIn text on the settings page.'
            : 'Set up modaicom to draft replies.'}
        </p>
        <button className="retry-button" onClick={openOptions}>Open settings</button>
      </div>
    )
  }

  const { state } = gen
  return (
    <div className="generation">
      <ResponseControls prefs={preferences.prefs} update={preferences.update} />
      {state.phase === 'idle' && (
        <button className="generation__go" onClick={run} disabled={!preferences.ready}>Generate reply</button>
      )}
      {state.phase === 'generating' && (
        <><p className="generation__hint" role="status">Drafting…</p><button className="retry-button" onClick={gen.cancel}>Stop</button></>
      )}
      {state.phase === 'done' && <DraftView text={state.text} onRegenerate={run} />}
      {state.phase === 'error' && (
        <>
          <p className="generation__error">{generationErrorMessages[state.kind]}</p>
          {isRetryableGenerationError(state.kind)
            ? <button className="retry-button" onClick={run}>Retry</button>
            : <button className="retry-button" onClick={openOptions}>Open settings</button>}
        </>
      )}
    </div>
  )
}

export function Popup() {
  const [result, setResult] = useState<DetectionResult | null>(null)
  const [contextResult, setContextResult] = useState<ContextState | null>(null)
  const [isFeed, setIsFeed] = useState(false)
  const [providerStatus, setProviderStatus] = useState<ProviderStatusResult | null>(null)
  const gen = useGeneration()
  const { reset: resetGeneration } = gen

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
    resetGeneration()
    try {
      const status: unknown = await chrome.runtime.sendMessage({ v: GENERATION_PROTOCOL_VERSION, type: 'GET_PROVIDER_STATUS' })
      if (status && typeof status === 'object' && typeof (status as ProviderStatus).configured === 'boolean') {
        setProviderStatus(status as ProviderStatus)
      } else {
        if (import.meta.env.DEV) {
          console.warn('[modaicom] GET_PROVIDER_STATUS returned an unexpected shape — the service worker may be stale', status)
        }
        setProviderStatus({ reachable: false })
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[modaicom] GET_PROVIDER_STATUS failed — the service worker is unreachable', error)
      }
      setProviderStatus({ reachable: false })
    }
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
  }, [resetGeneration])

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
          context.kind === 'success' ? <>
            <InteractionView context={context.context} />
            <GenerationPanel context={context.context} status={providerStatus} gen={gen} onRetryStatus={load} />
          </> :
          <><p className="context-panel__message">{showNeutralFeed ? 'Select a LinkedIn post to continue.' : contextMessages[context.kind]}</p>{canRetryContext ? <ActionButton label="Retry" onClick={load} /> : null}</>}
      </section> : null}
    </main>
  )
}
