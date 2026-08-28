import { extractPostContextFromElementInPage, type PostExtractionResult } from '../features/linkedin-context/extractPostContext'
import { classifyLinkedInRoute } from '../features/linkedin-context/routes'
import { FEED_CONTAINER_SELECTOR, FEED_POST_ROOT_SELECTOR, POST_ROOT_SELECTOR, isValidatedPostRoot, stablePostIdentity, postRootVariant, feedContainerVariant } from '../features/linkedin-context/postAdapter'
import { RELAY_VERSION } from '../shared/relay'
import { EDITOR_SELECTOR, isEligibleCommentComposer } from './composerAdapter'
import { recordDiagnostic } from './diagnostics'

const OWNED_WRAPPER = 'data-modaicom-inline-wrapper'
const OWNER_TOKEN = 'data-modaicom-inline-target'
const BUSY = 'data-modaicom-inline-busy'
let generation = 0
const sessionId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `session-${Math.random().toString(36).slice(2)}`
let observer: MutationObserver | undefined
let reconcileTimer: number | undefined
let bootstrapRetryTimer: number | undefined
let bootstrapRetryAttempts = 0
let lastRoute = location.href
let initialized = false
const ownerKeys = new WeakMap<HTMLElement, string>()
const originalHistory: Partial<Record<'pushState' | 'replaceState', History['pushState'] | History['replaceState']>> = {}

export function isSupportedRoute(urlString = location.href): boolean { return classifyLinkedInRoute(urlString) !== 'unsupported' }
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
function removeOwnedUi(): void { document.querySelectorAll(`[${OWNED_WRAPPER}]`).forEach((node) => node.remove()); document.querySelectorAll(`[${OWNER_TOKEN}]`).forEach((node) => node.removeAttribute(OWNER_TOKEN)) }
function sendClearRelay(): void { if (typeof chrome === 'undefined') return; void chrome.runtime.sendMessage({ version: RELAY_VERSION, type: 'CLEAR_RELAY', sessionId }).catch(() => undefined) }
function ownerKey(owner: HTMLElement): string { const existing = ownerKeys.get(owner); if (existing) return existing; const stable = stablePostIdentity(owner); const key = stable?.trim() || `ephemeral-${Math.random().toString(36).slice(2)}`; ownerKeys.set(owner, key); return key }
function insertTrigger(editor: HTMLElement, owner: HTMLElement, key: string): void {
  if (Array.from(document.querySelectorAll<HTMLElement>(`[${OWNED_WRAPPER}]`)).some((node) => node.dataset.modaicomOwner === key)) return
  recordDiagnostic({ stage: isFeedRoute() ? 'feed' : 'individual', event: 'trigger-insertion', insertionAttempted: true })
  const wrapper = document.createElement('span'); wrapper.dataset.modaicomInlineWrapper = ''; wrapper.dataset.modaicomOwner = key
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'modaicom'; button.setAttribute('aria-label', 'modaicom')
  button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); if (button.disabled || !owner.isConnected || !isSupportedRoute()) return; button.disabled = true; button.setAttribute(BUSY, ''); const clickGeneration = generation + 1; generation = clickGeneration; owner.setAttribute(OWNER_TOKEN, String(clickGeneration)); recordDiagnostic({ stage: classifyLinkedInRoute(location.href) === 'feed' ? 'feed' : 'individual', event: 'click', routeRecognized: classifyLinkedInRoute(location.href) !== 'unsupported', candidateRootVariant: postRootVariant(owner) ?? 'unknown', snapshotValidationPassed: owner.isConnected, stableIdentifierValidationPassed: Boolean(stablePostIdentity(owner)), exactRootExtractorInvoked: true }); let result: PostExtractionResult; try { result = extractPostContextFromElementInPage(owner, location.href) } catch { result = { kind: 'unexpected-error' } } if (!owner.isConnected || location.href !== lastRoute) result = { kind: 'stale-target' }; owner.removeAttribute(OWNER_TOKEN); button.disabled = false; button.removeAttribute(BUSY); recordDiagnostic({ stage: classifyLinkedInRoute(location.href) === 'feed' ? 'feed' : 'individual', event: 'extraction', extractionOutcome: result.kind, authorFieldFound: result.kind === 'success', authoredBodyFieldFound: result.kind === 'success', normalizationSucceeded: result.kind === 'success' }); void chrome.runtime.sendMessage({ version: RELAY_VERSION, type: 'INLINE_EXTRACTION_RESULT', generation: clickGeneration, sessionId, result }).then((response) => recordDiagnostic({ stage: classifyLinkedInRoute(location.href) === 'feed' ? 'feed' : 'individual', event: 'relay', messageAccepted: Boolean(response), relayWriteAccepted: response?.accepted !== false })).catch(() => recordDiagnostic({ stage: classifyLinkedInRoute(location.href) === 'feed' ? 'feed' : 'individual', event: 'relay', code: 'RELAY_REJECTED', messageAccepted: false, relayWriteAccepted: false })) })
  wrapper.append(button); editor.insertAdjacentElement('afterend', wrapper)
}
export function reconcile(urlString = location.href): void { recordDiagnostic({ stage: isFeedRoute(urlString) ? 'feed' : 'individual', event: 'reconcile', routeRecognized: isSupportedRoute(urlString), feedContainerVariant: isFeedRoute(urlString) ? (feedRoot(document) ? feedContainerVariant(feedRoot(document) as Element) : 'none') : undefined }); if (!isSupportedRoute(urlString)) { removeOwnedUi(); return } const seen = new Set<string>(); document.querySelectorAll<HTMLElement>(EDITOR_SELECTOR).forEach((editor) => { if (!isEligibleCommentComposer(editor)) return; const owner = owningPost(editor, urlString); if (!owner) return; const key = ownerKey(owner); if (seen.has(key)) return; seen.add(key); insertTrigger(editor, owner, key) }); document.querySelectorAll<HTMLElement>(`[${OWNED_WRAPPER}]`).forEach((node) => { if (!seen.has(node.dataset.modaicomOwner ?? '')) node.remove() }) }
export function observationScopes(urlString = location.href): HTMLElement[] { if (!isSupportedRoute(urlString)) return []; const main = document.querySelector<HTMLElement>('main'); const feed = feedRoot(document); const posts = postCandidates(document, urlString); const scopes = isFeedRoute(urlString) ? (feed ? [feed] : main ? [main] : []) : (posts.length ? posts : main ? [main] : []); return Array.from(new Set(scopes)) }
function cancelBootstrapRetry(): void { if (bootstrapRetryTimer !== undefined) { window.clearTimeout(bootstrapRetryTimer); bootstrapRetryTimer = undefined } bootstrapRetryAttempts = 0 }
function scheduleBootstrapRetry(): void { if (bootstrapRetryTimer !== undefined || bootstrapRetryAttempts >= 5 || !isSupportedRoute()) return; bootstrapRetryTimer = window.setTimeout(() => { bootstrapRetryTimer = undefined; bootstrapRetryAttempts += 1; configureObserver(); if (observationScopes().length === 0 && bootstrapRetryAttempts < 5) scheduleBootstrapRetry() }, 200) }
function configureObserver(): void { observer?.disconnect(); observer = undefined; if (!isSupportedRoute()) { cancelBootstrapRetry(); return }; const scopes = observationScopes(); if (scopes.length === 0) { scheduleBootstrapRetry(); return }; cancelBootstrapRetry(); observer = new MutationObserver(scheduleReconcile); scopes.forEach((scope) => observer?.observe(scope, { childList: true, subtree: true })) }
function scheduleReconcile(): void { if (reconcileTimer !== undefined) window.clearTimeout(reconcileTimer); reconcileTimer = window.setTimeout(() => { reconcileTimer = undefined; if (location.href !== lastRoute) { lastRoute = location.href; cancelBootstrapRetry(); removeOwnedUi(); sendClearRelay() } reconcile(); configureObserver() }, 50) }
function installHistoryHooks(): void { (['pushState', 'replaceState'] as const).forEach((method) => { if (originalHistory[method]) return; const original = history[method]; originalHistory[method] = original; history[method] = function (...args: Parameters<History[typeof method]>) { const result = original.apply(this, args); window.dispatchEvent(new Event('modaicom-route-change')); return result } }); window.addEventListener('popstate', scheduleReconcile); window.addEventListener('modaicom-route-change', scheduleReconcile) }
function restoreHistoryHooks(): void { (['pushState', 'replaceState'] as const).forEach((method) => { const original = originalHistory[method]; if (original) history[method] = original; delete originalHistory[method] }); window.removeEventListener('popstate', scheduleReconcile); window.removeEventListener('modaicom-route-change', scheduleReconcile) }
export function initializeInlineTriggerContentScript(): void { if (initialized) return; initialized = true; lastRoute = location.href; installHistoryHooks(); sendClearRelay(); reconcile(); configureObserver() }
export function teardownInlineTriggerContentScript(): void { observer?.disconnect(); observer = undefined; cancelBootstrapRetry(); if (reconcileTimer !== undefined) { window.clearTimeout(reconcileTimer); reconcileTimer = undefined }; removeOwnedUi(); restoreHistoryHooks(); initialized = false }
if (typeof document !== 'undefined') initializeInlineTriggerContentScript()
