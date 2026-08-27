export type ExtractedPostContext = {
  authorDisplayName: string
  originalAuthoredText: string
  authorHeadline?: string
  stablePostIdentifier?: string
  publicationTimeLabel?: string
}

export type PostExtractionResult =
  | { kind: 'success'; context: ExtractedPostContext }
  | {
      kind:
        | 'unsupported-surface'
        | 'post-not-found'
        | 'ambiguous-post'
        | 'collapsed-post'
        | 'no-text'
        | 'author-not-found'
        | 'unexpected-error'
    }

export function extractPostContextInPage(
  root: Document = document,
  currentUrl: string = location.href,
): PostExtractionResult {
  let url: URL
  try {
    url = new URL(currentUrl)
  } catch {
    return { kind: 'unexpected-error' }
  }
  const individualPostPath = /^\/posts\/[^/]+\/?$/
  const activityPath = /^\/feed\/update\/urn:li:activity:[^/]+\/?$/
  const isLinkedInHost =
    url.protocol === 'https:' &&
    (url.hostname === 'linkedin.com' || url.hostname === 'www.linkedin.com')
  const isIndividualPostRoute =
    individualPostPath.test(url.pathname) || activityPath.test(url.pathname)

  if (!isLinkedInHost || !isIndividualPostRoute) {
    return { kind: 'unsupported-surface' }
  }

  const candidateSelector =
    'article[data-urn], article[data-id], [data-urn^="urn:li:activity:"], [data-id^="urn:li:activity:"]'
  const markedCandidates = Array.from(
    root.querySelectorAll<HTMLElement>(candidateSelector),
  )
  const candidates = markedCandidates.length
    ? markedCandidates.filter(
        (candidate) =>
          !candidate.parentElement?.closest(candidateSelector),
      )
    : Array.from(root.querySelectorAll<HTMLElement>('article'))

  if (candidates.length === 0) {
    return { kind: 'post-not-found' }
  }
  if (candidates.length !== 1) {
    return { kind: 'ambiguous-post' }
  }
  const [candidate] = candidates
  if (!candidate) {
    return { kind: 'post-not-found' }
  }

  const belongsToCandidate = (element: Element) =>
    element.closest(candidateSelector) === candidate ||
    (candidate.matches('article') && !element.closest(candidateSelector))

  const hasSeeMore = Array.from(
    candidate.querySelectorAll<HTMLElement>('button, a, [role="button"]'),
  ).some(
    (control) =>
      belongsToCandidate(control) &&
      /\bsee\s+more\b/i.test(control.textContent?.trim() ?? ''),
  )
  if (hasSeeMore) {
    return { kind: 'collapsed-post' }
  }

  const textFrom = (selectors: string[]) => {
    for (const selector of selectors) {
      const element = Array.from(
        candidate.querySelectorAll<HTMLElement>(selector),
      ).find(belongsToCandidate)
      if (element) {
        const text = element.textContent
          ?.replace(/\u00a0/g, ' ')
          .split('\n')
          .map((line) => line.replace(/[ \t]+/g, ' ').trim())
          .filter(Boolean)
          .join('\n')
        if (text) return text
      }
    }
    return undefined
  }

  const authorDisplayName = textFrom([
    '[data-testid="actor-name"]',
    '[data-test-id="feed-shared-actor__name"]',
    '[aria-label^="By "]',
  ])
  if (!authorDisplayName) {
    return { kind: 'author-not-found' }
  }

  const originalAuthoredText = textFrom([
    '[data-testid="post-body"]',
    '[data-testid="expandable-text-box"]',
    '[data-test-id="feed-shared-update-v2__description"]',
    '.feed-shared-update-v2__description',
    '.feed-shared-inline-show-more-text',
  ])
  if (!originalAuthoredText) {
    return { kind: 'no-text' }
  }

  const authorHeadline = textFrom([
    '[data-testid="actor-headline"]',
    '[data-test-id="feed-shared-actor__description"]',
  ])
  const publicationTimeLabel = textFrom([
    'time',
    '[data-testid="post-time"]',
    '[data-test-id="feed-shared-actor__sub-description"]',
  ])

  const explicitIdentifier =
    candidate.getAttribute('data-urn') ?? candidate.getAttribute('data-id')
  const stablePostIdentifier =
    explicitIdentifier?.startsWith('urn:li:') && explicitIdentifier.trim()
      ? explicitIdentifier.trim()
      : url.pathname.match(/(urn:li:activity:[^/]+)/)?.[1]

  return {
    kind: 'success',
    context: {
      authorDisplayName,
      originalAuthoredText,
      ...(authorHeadline ? { authorHeadline } : {}),
      ...(stablePostIdentifier ? { stablePostIdentifier } : {}),
      ...(publicationTimeLabel ? { publicationTimeLabel } : {}),
    },
  }
}

export const extractPostContextFromDocument = extractPostContextInPage

export async function extractCurrentPostContext(): Promise<PostExtractionResult> {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    })
    if (!activeTab?.id) {
      return { kind: 'unexpected-error' }
    }

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: extractPostContextInPage,
    })
    return injection?.result ?? { kind: 'unexpected-error' }
  } catch (error) {
    console.error('LinkedIn context extraction failed', error)
    return { kind: 'unexpected-error' }
  }
}

