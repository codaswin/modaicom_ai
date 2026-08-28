import {
  extractPostContextInPage,
  isPostExtractionResult,
  type PostExtractionResult,
} from '../linkedin-context/extractPostContext'

export type FeedSelectionResult =
  | { kind: 'ready'; count: number }
  | { kind: 'no-candidates' | 'ambiguous-candidates' | 'selection-failure' }

export const FEED_CANDIDATE_SELECTOR =
  'article[data-urn^="urn:li:activity:"], article[data-id^="urn:li:activity:"]'
export const FEED_ROOT_SELECTOR = 'main [role="feed"]'

export function isSupportedFeedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'linkedin.com' || url.hostname === 'www.linkedin.com') &&
      url.pathname === '/feed/'
    )
  } catch {
    return false
  }
}

function feedCandidates(root: Document): HTMLElement[] {
  const feedRoot = root.querySelector<HTMLElement>(FEED_ROOT_SELECTOR)
  if (!feedRoot) return []
  return Array.from(feedRoot.querySelectorAll<HTMLElement>(FEED_CANDIDATE_SELECTOR)).filter(
    (candidate) =>
      !candidate.parentElement?.closest(FEED_CANDIDATE_SELECTOR) &&
      Boolean(candidate.querySelector(
        '[data-testid="post-body"], [data-testid="expandable-text-box"], [data-test-id="feed-shared-update-v2__description"], .feed-shared-update-v2__description, .feed-shared-inline-show-more-text',
      )),
  )
}

function candidateSnapshot(candidates: HTMLElement[]): string {
  return candidates
    .map((candidate) => candidate.getAttribute('data-urn') ?? candidate.getAttribute('data-id') ?? candidate.id)
    .join('|')
}

export function cleanupFeedSelectionInPage(root: Document = document): void {
  root
    .querySelectorAll('[data-modaicom-selection-control], [data-modaicom-selection-banner]')
    .forEach((element) => element.remove())
  root.querySelectorAll('[data-modaicom-selected-token]').forEach((element) => {
    element.removeAttribute('data-modaicom-selected-token')
    element.removeAttribute('data-modaicom-stable-id')
  })
  root.documentElement.removeAttribute('data-modaicom-selection-session')
  root.documentElement.removeAttribute('data-modaicom-selection-snapshot')
  root.documentElement.removeAttribute('data-modaicom-selection-cancelled')
}

export function startFeedSelectionInPage(
  root: Document = document,
  currentUrl: string = location.href,
): FeedSelectionResult {
  let url: URL
  try {
    url = new URL(currentUrl)
  } catch {
    return { kind: 'selection-failure' }
  }
  if (
    url.protocol !== 'https:' ||
    (url.hostname !== 'linkedin.com' && url.hostname !== 'www.linkedin.com') ||
    url.pathname !== '/feed/'
  ) return { kind: 'selection-failure' }

  cleanupFeedSelectionInPage(root)
  const candidates = feedCandidates(root)
  const ids = candidates
    .map((candidate) => candidate.getAttribute('data-urn') ?? candidate.getAttribute('data-id'))
    .filter((id): id is string => Boolean(id))
  if (candidates.length === 0) return { kind: 'no-candidates' }
  if (new Set(ids).size !== ids.length) return { kind: 'ambiguous-candidates' }
  const snapshot = candidateSnapshot(candidates)
  const session = `modaicom-${Date.now()}-${Math.random().toString(36).slice(2)}`
  root.documentElement.setAttribute('data-modaicom-selection-session', session)
  root.documentElement.setAttribute('data-modaicom-selection-snapshot', snapshot)

  const banner = root.createElement('div')
  banner.dataset.modaicomSelectionBanner = ''
  banner.textContent = 'Select a LinkedIn post to continue. '
  banner.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;padding:12px;background:#fff;border:2px solid #5b3fd6;border-radius:8px;color:#1e1b2e;font:600 14px system-ui;'
  const cancel = root.createElement('button')
  cancel.type = 'button'
  cancel.textContent = 'Cancel selection'
  cancel.style.cssText = 'margin-left:8px;'
  cancel.addEventListener('click', () => {
    cleanupFeedSelectionInPage(root)
    root.documentElement.setAttribute('data-modaicom-selection-cancelled', '')
  })
  banner.append(cancel)
  root.documentElement.append(banner)

  candidates.forEach((candidate, index) => {
    const button = root.createElement('button')
    button.type = 'button'
    button.textContent = 'Use this post'
    button.dataset.modaicomSelectionControl = ''
    button.setAttribute('aria-label', 'Use this post')
    let candidateId = candidate.id
    if (!candidateId || root.querySelectorAll(`#${CSS.escape(candidateId)}`).length !== 1) {
      candidateId = `${session}-post-${index + 1}`
      while (root.getElementById(candidateId)) candidateId += '-x'
      candidate.id = candidateId
    }
    button.setAttribute('aria-describedby', candidateId)
    button.style.cssText = 'display:block;margin:8px 0;padding:6px 10px;z-index:2147483646;position:relative;'
    candidate.prepend(button)
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      candidate.setAttribute('data-modaicom-selected-token', session)
      const stableId = candidate.getAttribute('data-urn') ?? candidate.getAttribute('data-id')
      if (stableId) candidate.setAttribute('data-modaicom-stable-id', stableId)
      root.querySelectorAll('[data-modaicom-selection-control]').forEach((element) => element.remove())
      banner.remove()
    })
  })

  return { kind: 'ready', count: candidates.length }
}


async function cleanupActiveTabSelection(): Promise<void> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (activeTab?.id) {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: cleanupFeedSelectionInPage,
      })
    }
  } catch {
    // Cleanup is best effort when the tab is no longer accessible.
  }
}

export async function startFeedSelection(): Promise<FeedSelectionResult> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!activeTab?.id || !activeTab.url || !isSupportedFeedUrl(activeTab.url)) {
      return { kind: 'selection-failure' }
    }
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: startFeedSelectionInPage,
    })
    const result: unknown = injection?.result
    if (!result || typeof result !== 'object') {
      await cleanupActiveTabSelection()
      return { kind: 'selection-failure' }
    }
    const value = result as Record<string, unknown>
    if (value.kind === 'ready' && typeof value.count === 'number' && value.count > 0) {
      return { kind: 'ready', count: value.count }
    }
    if (value.kind === 'no-candidates' || value.kind === 'ambiguous-candidates' || value.kind === 'selection-failure') {
      return { kind: value.kind }
    }
    await cleanupActiveTabSelection()
    return { kind: 'selection-failure' }
  } catch {
    await cleanupActiveTabSelection()
    return { kind: 'selection-failure' }
  }
}

export async function extractSelectedFeedPost(): Promise<PostExtractionResult> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!activeTab?.id || !activeTab.url || !isSupportedFeedUrl(activeTab.url)) {
      return { kind: 'unsupported-surface' }
    }
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: extractPostContextInPage,
    })
    const result: unknown = injection?.result
    return isPostExtractionResult(result) ? result : { kind: 'unexpected-error' }
  } catch {
    await cleanupActiveTabSelection()
    return { kind: 'unexpected-error' }
  }
}
