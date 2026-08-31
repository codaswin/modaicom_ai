import { extractPostContextInPage } from '../features/linkedin-context/extractPostContext'
import { extractInteractionContextInPage } from '../features/linkedin-context/extractInteractionContext'
import { commentOwningPost, commentStableIdentity, isValidatedCommentRoot, legacyCommentRoot } from '../features/linkedin-context/commentAdapter'
import { postExtractionToInteractionResult, type InteractionExtractionResult } from '../features/linkedin-context/interactionContext'
import { classifyLinkedInRoute } from '../features/linkedin-context/routes'
import { FEED_CONTAINER_SELECTOR, FEED_POST_ROOT_SELECTOR, POST_ROOT_SELECTOR, feedMarkupRegime, isValidatedPostRoot, stablePostIdentity, postRootVariant, feedContainerVariant } from '../features/linkedin-context/postAdapter'
import { RELAY_TTL_MS, RELAY_VERSION } from '../shared/relay'
import { isInsertDraftMessage, isRequestPageExtractionMessage, type InsertDraftResponse } from '../shared/protocol'
import { EDITOR_SELECTOR, classifyComposer, isEligibleCommentComposer, looksLikeReplyComposer } from './composerAdapter'
import { recordDiagnostic } from './diagnostics'
import { editorPlainText, insertDraft } from './insertDraft'
import { OWNED_WRAPPER_ATTR, createInlineTrigger, type InlineTriggerHandle } from './triggerButton'

type ResolvedTarget =
  | { kind: 'post-comment'; postElement: HTMLElement; editor: HTMLElement; key: string }
  | { kind: 'comment-reply'; postElement: HTMLElement; commentElement: HTMLElement; editor: HTMLElement; key: string }

// The exact editor the user's trigger click pointed at, held for the whole
// Inline Targeting Session so a later INSERT_DRAFT can write into it — and only
// it (Phase 8 / ADR-0011). Cleared on route change, a fresh trigger click, the
// relay TTL, or teardown.
type InsertSession = {
  editor: HTMLElement
  kind: ResolvedTarget['kind']
  sessionId: string
  generation: number
  route: string
  stashedAt: number
  // The exact text modaicom last inserted here, so a later Regenerate + Insert
  // can replace an untouched prior insertion (and only that).
  lastInserted?: string
}
let insertSession: InsertSession | undefined
function clearInsertSession(): void {
  insertSession = undefined
}

const OWNED_WRAPPER = OWNED_WRAPPER_ATTR
const OWNER_TOKEN = 'data-modaicom-inline-target'
const COMMENT_TOKEN = 'data-modaicom-inline-comment-target'
let generation = 0
const sessionId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `session-${Math.random().toString(36).slice(2)}`
let observer: MutationObserver | undefined
let reconcileTimer: number | undefined
let reconcilePendingSince = 0
let safetyTimer: number | undefined
let bootstrapRetryTimer: number | undefined
let bootstrapRetryAttempts = 0
let lastRoute = location.href
let initialized = false
let runtimeInvalidated = false
const ownerKeys = new WeakMap<HTMLElement, string>()
const originalHistory: Partial<Record<'pushState' | 'replaceState', History['pushState'] | History['replaceState']>> = {}

export function isSupportedRoute(urlString = location.href): boolean { return !runtimeInvalidated && classifyLinkedInRoute(urlString) !== 'unsupported' }
export function markRuntimeInvalidated(): void { if (runtimeInvalidated) return; runtimeInvalidated = true; observer?.disconnect(); observer = undefined; cancelBootstrapRetry(); stopSafetyReconcile(); if (reconcileTimer !== undefined) { window.clearTimeout(reconcileTimer); reconcileTimer = undefined }; removeOwnedUi(); restoreHistoryHooks(); initialized = false }
function isFeedRoute(urlString = location.href): boolean { return classifyLinkedInRoute(urlString) === 'feed' }
function feedRoot(root: Document | Element = document): HTMLElement | undefined { return root.querySelector<HTMLElement>(FEED_CONTAINER_SELECTOR) ?? undefined }
export function postCandidates(root: Document | Element = document, urlString = location.href): HTMLElement[] {
  const feed = isFeedRoute(urlString)
  const scope = feed ? feedRoot(root) : root
  const selector = feed ? FEED_POST_ROOT_SELECTOR : POST_ROOT_SELECTOR
  const found = Array.from(scope?.querySelectorAll<HTMLElement>(selector) ?? []).filter((candidate) => !candidate.parentElement?.closest(selector))
  if (!feed) return found
  const owned = found.filter((candidate) => candidate.closest(FEED_CONTAINER_SELECTOR) === scope && isValidatedPostRoot(candidate, true))
  if (feed && !scope) recordDiagnostic({ stage: 'feed', event: 'candidate-discovery', code: 'FEED_ROOT_NOT_FOUND', routeRecognized: true, candidateCount: 0 })
  if (feed) { recordDiagnostic({ stage: 'feed', event: 'candidate-discovery', candidateCount: owned.length }); owned.forEach((candidate) => recordDiagnostic({ stage: 'feed', event: 'candidate', candidateRootVariant: postRootVariant(candidate), activityIdentifierPresent: Boolean(stablePostIdentity(candidate)), originalBodyMarkerPresent: true })) }
  const counts = new Map<string, number>()
  owned.forEach((candidate) => { const id = stablePostIdentity(candidate); if (id) counts.set(id, (counts.get(id) ?? 0) + 1) })
  return owned.filter((candidate) => { const id = stablePostIdentity(candidate); return Boolean(id && counts.get(id) === 1) })
}
export { isEligibleCommentComposer as composerIsEligible }
function owningPost(editor: HTMLElement, urlString = location.href): HTMLElement | undefined {
  const candidates = postCandidates(document, urlString)
  const owner = editor.closest<HTMLElement>(isFeedRoute(urlString) ? FEED_POST_ROOT_SELECTOR : POST_ROOT_SELECTOR)
  if (owner && candidates.includes(owner)) return owner
  const sole = candidates[0]
  return !isFeedRoute(urlString) && candidates.length === 1 && sole ? (sole.contains(editor) ? sole : undefined) : undefined
}
function removeOwnedUi(): void {
  // Every caller (route change, unsupported route, runtime invalidation,
  // teardown) also ends any Inline Targeting Session, so the held editor goes too.
  clearInsertSession()
  document.querySelectorAll(`[${OWNED_WRAPPER}]`).forEach((node) => node.remove())
  document.querySelectorAll(`[${OWNER_TOKEN}]`).forEach((node) => node.removeAttribute(OWNER_TOKEN))
  document.querySelectorAll(`[${COMMENT_TOKEN}]`).forEach((node) => node.removeAttribute(COMMENT_TOKEN))
}
function sendClearRelay(): void { if (runtimeInvalidated || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return; try { void chrome.runtime.sendMessage({ version: RELAY_VERSION, type: 'CLEAR_RELAY', sessionId }).catch(() => markRuntimeInvalidated()) } catch { markRuntimeInvalidated() } }
function ownerKey(owner: HTMLElement): string { const existing = ownerKeys.get(owner); if (existing) return existing; const stable = stablePostIdentity(owner); const key = stable?.trim() || `ephemeral-${Math.random().toString(36).slice(2)}`; ownerKeys.set(owner, key); return key }

// Resolves one editor to a validated Interaction Target, or nothing. Fails
// closed on any ambiguity in the ownership chain.
function resolveTarget(editor: HTMLElement, urlString = location.href): ResolvedTarget | undefined {
  const kind = classifyComposer(editor)
  if (!kind) {
    if (looksLikeReplyComposer(editor)) recordDiagnostic({ stage: 'individual', event: 'comment-reply', code: 'COMMENT_REPLY_REGIME_UNSUPPORTED' })
    return undefined
  }
  if (kind === 'post-comment') {
    const post = owningPost(editor, urlString)
    return post ? { kind, postElement: post, editor, key: `post-comment:${ownerKey(post)}` } : undefined
  }
  const comment = legacyCommentRoot(editor)
  if (!comment || !isValidatedCommentRoot(comment)) return undefined
  const post = commentOwningPost(comment)
  if (!post || !isValidatedPostRoot(post, false)) {
    recordDiagnostic({ stage: 'individual', event: 'comment-reply', code: 'AMBIGUOUS_TARGET_COMMENT' })
    return undefined
  }
  const id = commentStableIdentity(comment)
  if (!id) return undefined
  return { kind, postElement: post, commentElement: comment, editor, key: `comment-reply:${id}` }
}

// LinkedIn's comment/reply action row always carries an emoji-picker button
// whose accessible label mentions "emoji". We climb a few levels from the editor
// and take the emoji button in the nearest containing ancestor — that is this
// composer's, not a neighbour's. If the label ever changes we get nothing and
// fall back to placing the trigger after the editor.
function findEmojiButton(editor: HTMLElement): HTMLElement | undefined {
  let scope: HTMLElement | null = editor
  for (let depth = 0; depth < 5 && scope; depth += 1) {
    const button = scope.querySelector<HTMLElement>('button[aria-label*="emoji" i]')
    if (button && !button.closest(`[${OWNED_WRAPPER}]`)) return button
    scope = scope.parentElement
  }
  return undefined
}

function insertTrigger(editor: HTMLElement, target: ResolvedTarget): void {
  const key = target.key
  if (Array.from(document.querySelectorAll<HTMLElement>(`[${OWNED_WRAPPER}]`)).some((node) => node.dataset.modaicomOwner === key)) return
  const stage = isFeedRoute() ? 'feed' : 'individual'
  recordDiagnostic({ stage, event: 'trigger-insertion', insertionAttempted: true })
  const trigger = createInlineTrigger(target.kind, key, (event) => runInlineExtraction(event, trigger, target))
  const emojiButton = findEmojiButton(editor)
  if (emojiButton?.parentElement) {
    emojiButton.parentElement.insertBefore(trigger.host, emojiButton)
  } else {
    editor.insertAdjacentElement('afterend', trigger.host)
  }
}

function runInlineExtraction(event: Event, trigger: InlineTriggerHandle, target: ResolvedTarget): void {
  event.preventDefault()
  event.stopPropagation()
  const owner = target.postElement
  if (trigger.busy || !owner.isConnected || !isSupportedRoute()) return
  trigger.setBusy(true)
  const clickGeneration = generation + 1
  generation = clickGeneration
  // Hold the exact editor for this session so a later Insert writes only here.
  insertSession = { editor: target.editor, kind: target.kind, sessionId, generation: clickGeneration, route: location.href, stashedAt: Date.now() }
  owner.setAttribute(OWNER_TOKEN, String(clickGeneration))
  if (target.kind === 'comment-reply') target.commentElement.setAttribute(COMMENT_TOKEN, String(clickGeneration))
  const stage = classifyLinkedInRoute(location.href) === 'feed' ? 'feed' : 'individual'
  recordDiagnostic({ stage, event: 'click', routeRecognized: classifyLinkedInRoute(location.href) !== 'unsupported', candidateRootVariant: postRootVariant(owner) ?? 'unknown', snapshotValidationPassed: owner.isConnected, stableIdentifierValidationPassed: Boolean(stablePostIdentity(owner)), exactRootExtractorInvoked: true })

  let result: InteractionExtractionResult
  try {
    result = extractInteractionContextInPage(
      target.kind === 'comment-reply'
        ? { kind: 'comment-reply', postElement: owner, commentElement: target.commentElement }
        : { kind: 'post-comment', postElement: owner },
      location.href,
    )
  } catch {
    result = { kind: 'unexpected-error' }
  }
  const commentStale = target.kind === 'comment-reply' && !target.commentElement.isConnected
  if (!owner.isConnected || location.href !== lastRoute) result = { kind: 'stale-target' }
  else if (commentStale) result = { kind: 'comment-stale-target' }
  owner.removeAttribute(OWNER_TOKEN)
  if (target.kind === 'comment-reply') target.commentElement.removeAttribute(COMMENT_TOKEN)
  trigger.setBusy(false)
  recordDiagnostic({ stage, event: 'extraction', extractionOutcome: result.kind, authorFieldFound: result.kind === 'success', authoredBodyFieldFound: result.kind === 'success', normalizationSucceeded: result.kind === 'success' })

  if (runtimeInvalidated || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    markRuntimeInvalidated()
    return
  }
  try {
    void chrome.runtime
      .sendMessage({ version: RELAY_VERSION, type: 'INLINE_EXTRACTION_RESULT', generation: clickGeneration, sessionId, result })
      .then((response) => recordDiagnostic({ stage, event: 'relay', messageAccepted: Boolean(response), relayWriteAccepted: response?.accepted !== false }))
      .catch(() => {
        markRuntimeInvalidated()
        recordDiagnostic({ stage, event: 'relay', code: 'RELAY_REJECTED', messageAccepted: false, relayWriteAccepted: false })
      })
  } catch {
    markRuntimeInvalidated()
  }
}
function warnOnUnrecognizedFeed(): void {
  if (feedMarkupRegime(document) !== 'unknown') return
  recordDiagnostic({ stage: 'feed', event: 'regime', code: 'FEED_REGIME_UNKNOWN', routeRecognized: true })
  if (import.meta.env.DEV) console.warn('[modaicom] Unrecognized LinkedIn feed markup; the inline trigger is unavailable on this feed until the selectors are updated.')
}
export function reconcile(urlString = location.href): void { recordDiagnostic({ stage: isFeedRoute(urlString) ? 'feed' : 'individual', event: 'reconcile', routeRecognized: isSupportedRoute(urlString), feedContainerVariant: isFeedRoute(urlString) ? (feedRoot(document) ? feedContainerVariant(feedRoot(document) as Element) : 'none') : undefined }); if (!isSupportedRoute(urlString)) { removeOwnedUi(); return } if (isFeedRoute(urlString)) warnOnUnrecognizedFeed(); const seen = new Set<string>(); document.querySelectorAll<HTMLElement>(EDITOR_SELECTOR).forEach((editor) => { const target = resolveTarget(editor, urlString); if (!target) return; if (seen.has(target.key)) return; seen.add(target.key); insertTrigger(editor, target) }); document.querySelectorAll<HTMLElement>(`[${OWNED_WRAPPER}]`).forEach((node) => { if (!seen.has(node.dataset.modaicomOwner ?? '')) node.remove() }) }
export function observationScopes(urlString = location.href): HTMLElement[] { if (!isSupportedRoute(urlString)) return []; const main = document.querySelector<HTMLElement>('main'); const feed = feedRoot(document); const posts = postCandidates(document, urlString); const scopes = isFeedRoute(urlString) ? (feed ? [feed] : main ? [main] : []) : (posts.length ? posts : main ? [main] : []); return Array.from(new Set(scopes)) }
const BOOTSTRAP_MAX_ATTEMPTS = 120
const BOOTSTRAP_RETRY_MS = 300
const RECONCILE_DEBOUNCE_MS = 50
const RECONCILE_MAX_WAIT_MS = 400
// A low-frequency structural re-scan that catches a lazily-mounted composer even
// when a burst of LinkedIn feed mutations starves the debounced observer or the
// observer was scoped before the real feed container hydrated. Idempotent and
// cheap; it stops when the route becomes unsupported or on teardown.
const SAFETY_RECONCILE_MS = 1500
function cancelBootstrapRetry(): void { if (bootstrapRetryTimer !== undefined) { window.clearTimeout(bootstrapRetryTimer); bootstrapRetryTimer = undefined } bootstrapRetryAttempts = 0 }
function scheduleBootstrapRetry(): void { if (runtimeInvalidated || bootstrapRetryTimer !== undefined || bootstrapRetryAttempts >= BOOTSTRAP_MAX_ATTEMPTS || !isSupportedRoute()) return; bootstrapRetryTimer = window.setTimeout(() => { bootstrapRetryTimer = undefined; bootstrapRetryAttempts += 1; configureObserver(); if (!feedRoot(document) && isFeedRoute() && bootstrapRetryAttempts < BOOTSTRAP_MAX_ATTEMPTS) scheduleBootstrapRetry() }, BOOTSTRAP_RETRY_MS) }
function configureObserver(): void {
  if (runtimeInvalidated) return
  observer?.disconnect(); observer = undefined
  if (!isSupportedRoute()) { cancelBootstrapRetry(); stopSafetyReconcile(); return }
  startSafetyReconcile()
  const scopes = observationScopes()
  const main = document.querySelector<HTMLElement>('main')
  // Always keep a coarse net on <main> in addition to the precise scopes, so a
  // feed container that mounts after the observer was configured is still seen.
  const observed = Array.from(new Set([...scopes, ...(main ? [main] : [])]))
  if (observed.length === 0) { scheduleBootstrapRetry(); return }
  // Keep looking for the real feed container until it exists (we may only have
  // <main> so far).
  if (isFeedRoute() && !feedRoot(document)) scheduleBootstrapRetry(); else cancelBootstrapRetry()
  observer = new MutationObserver(scheduleReconcile)
  observed.forEach((scope) => observer?.observe(scope, { childList: true, subtree: true }))
}
function runScheduledReconcile(): void {
  reconcileTimer = undefined
  reconcilePendingSince = 0
  if (location.href !== lastRoute) { lastRoute = location.href; cancelBootstrapRetry(); removeOwnedUi(); sendClearRelay() }
  reconcile(); configureObserver()
}
function scheduleReconcile(): void {
  if (runtimeInvalidated) return
  const now = Date.now()
  if (reconcilePendingSince === 0) reconcilePendingSince = now
  if (now - reconcilePendingSince >= RECONCILE_MAX_WAIT_MS) {
    if (reconcileTimer !== undefined) { window.clearTimeout(reconcileTimer); reconcileTimer = undefined }
    runScheduledReconcile()
    return
  }
  if (reconcileTimer !== undefined) window.clearTimeout(reconcileTimer)
  reconcileTimer = window.setTimeout(runScheduledReconcile, RECONCILE_DEBOUNCE_MS)
}
function startSafetyReconcile(): void {
  if (runtimeInvalidated || safetyTimer !== undefined) return
  safetyTimer = window.setInterval(() => {
    if (runtimeInvalidated || !isSupportedRoute()) { stopSafetyReconcile(); return }
    reconcile(); configureObserver()
  }, SAFETY_RECONCILE_MS)
}
function stopSafetyReconcile(): void { if (safetyTimer !== undefined) { window.clearInterval(safetyTimer); safetyTimer = undefined } }
function installHistoryHooks(): void { (['pushState', 'replaceState'] as const).forEach((method) => { if (originalHistory[method]) return; const original = history[method]; originalHistory[method] = original; history[method] = function (...args: Parameters<History[typeof method]>) { const result = original.apply(this, args); window.dispatchEvent(new Event('modaicom-route-change')); return result } }); window.addEventListener('popstate', scheduleReconcile); window.addEventListener('modaicom-route-change', scheduleReconcile) }
function restoreHistoryHooks(): void { (['pushState', 'replaceState'] as const).forEach((method) => { const original = originalHistory[method]; if (original) history[method] = original; delete originalHistory[method] }); window.removeEventListener('popstate', scheduleReconcile); window.removeEventListener('modaicom-route-change', scheduleReconcile) }
export function initializeInlineTriggerContentScript(): void { if (initialized || runtimeInvalidated) return; initialized = true; lastRoute = location.href; installHistoryHooks(); sendClearRelay(); reconcile(); configureObserver() }
export function teardownInlineTriggerContentScript(): void { runtimeInvalidated = false; observer?.disconnect(); observer = undefined; cancelBootstrapRetry(); stopSafetyReconcile(); if (reconcileTimer !== undefined) { window.clearTimeout(reconcileTimer); reconcileTimer = undefined }; reconcilePendingSince = 0; removeOwnedUi(); restoreHistoryHooks(); initialized = false }

// The popup's on-demand individual-post fallback (Phase 2) asks this content
// script to run the extractor in the page, rather than the service worker
// injecting a function whose module scope would be lost across serialization.
export function handlePagePopupExtractionRequest(message: unknown): InteractionExtractionResult | undefined {
  if (!isRequestPageExtractionMessage(message)) return undefined
  if (runtimeInvalidated) return { kind: 'unexpected-error' }
  try {
    return postExtractionToInteractionResult(extractPostContextInPage(document, location.href))
  } catch {
    return { kind: 'unexpected-error' }
  }
}
// Insert a Generated Draft into the exact editor held for the current Inline
// Targeting Session (Phase 8 / ADR-0011). Never re-resolves an editor; refuses
// unless the session, route, and exact node all still line up. The draft text
// is never logged.
type ContentInsertRefusal = 'editor-unavailable' | 'route-changed' | 'editor-not-empty' | 'insert-failed'

export function handleInsertDraftRequest(message: unknown): InsertDraftResponse | undefined {
  if (!isInsertDraftMessage(message)) return undefined
  const stage = isFeedRoute() ? 'feed' : 'individual'
  const refuse = (reason: ContentInsertRefusal): InsertDraftResponse => {
    recordDiagnostic({ stage, event: 'insertion', extractionOutcome: reason })
    return { ok: false, reason }
  }
  if (runtimeInvalidated) return refuse('editor-unavailable')

  const session = insertSession
  if (!session || session.sessionId !== message.sessionId || session.generation !== message.generation) {
    return refuse('editor-unavailable')
  }
  if (Date.now() - session.stashedAt > RELAY_TTL_MS) {
    clearInsertSession()
    return refuse('editor-unavailable')
  }
  if (location.href !== session.route) return refuse('route-changed')
  if (!session.editor.isConnected || classifyComposer(session.editor) !== session.kind) {
    return refuse('editor-unavailable')
  }

  // A repeat Insert of the identical draft into an untouched editor is a no-op.
  if (editorPlainText(session.editor) === message.text.trim()) {
    recordDiagnostic({ stage, event: 'insertion', extractionOutcome: 'noop' })
    return { ok: true }
  }

  const outcome = insertDraft(session.editor, message.text, { previousInsertion: session.lastInserted })
  if (outcome.ok) session.lastInserted = editorPlainText(session.editor)
  recordDiagnostic({ stage, event: 'insertion', extractionOutcome: outcome.ok ? 'success' : outcome.reason })
  return outcome
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id && chrome.runtime?.id && sender.id !== chrome.runtime.id) return false
    const extraction = handlePagePopupExtractionRequest(message)
    if (extraction !== undefined) {
      sendResponse(extraction)
      return true
    }
    const insertion = handleInsertDraftRequest(message)
    if (insertion !== undefined) {
      sendResponse(insertion)
      return true
    }
    return false
  })
}
if (typeof document !== 'undefined') initializeInlineTriggerContentScript()
