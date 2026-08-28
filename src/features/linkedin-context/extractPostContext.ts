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
        | 'cancelled'
        | 'stale-target'
        | 'no-candidates'
        | 'ambiguous-candidates'
        | 'selection-failure'
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
  const isFeedRoute = url.pathname === '/feed/'

  if (!isLinkedInHost || (!isIndividualPostRoute && !isFeedRoute)) {
    return { kind: 'unsupported-surface' }
  }

  const candidateSelector = isFeedRoute
    ? 'article[data-urn^="urn:li:activity:"], article[data-id^="urn:li:activity:"]'
    : 'article[data-urn], article[data-id], [data-urn^="urn:li:activity:"], [data-id^="urn:li:activity:"]'
  const candidateRoot = isFeedRoute
    ? root.querySelector<HTMLElement>('main [role="feed"]')
    : root
  const markedCandidates = Array.from(
    candidateRoot?.querySelectorAll<HTMLElement>(candidateSelector) ?? [],
  )
  const candidates = markedCandidates.length
    ? markedCandidates.filter(
        (candidate) =>
          !candidate.parentElement?.closest(candidateSelector),
      )
    : isFeedRoute
      ? []
      : Array.from(root.querySelectorAll<HTMLElement>('article'))

  const cleanupFeedSelection = () => {
    if (!isFeedRoute) return
    root
      .querySelectorAll('[data-modaicom-selection-control], [data-modaicom-selection-banner]')
      .forEach((element) => element.remove())
    root.querySelectorAll('[data-modaicom-selected-token]').forEach((element) => {
      element.removeAttribute('data-modaicom-selected-token')
      element.removeAttribute('data-modaicom-stable-id')
      element.removeAttribute('data-modaicom-selection-invalid')
    })
  }

  const selectedCandidate = isFeedRoute
    ? Array.from(root.querySelectorAll<HTMLElement>('[data-modaicom-selected-token]'))
    : []
  if (isFeedRoute && root.documentElement.hasAttribute('data-modaicom-selection-cancelled')) {
    root.documentElement.removeAttribute('data-modaicom-selection-cancelled')
    cleanupFeedSelection()
    return { kind: 'cancelled' }
  }
  if (isFeedRoute) {
    const session = root.documentElement.getAttribute('data-modaicom-selection-session')
    const snapshot = root.documentElement.getAttribute('data-modaicom-selection-snapshot')
    if (!session) {
      cleanupFeedSelection()
      return { kind: 'unsupported-surface' }
    }
    const selected = selectedCandidate[0]
    const currentSnapshot = candidates
      .map((candidate) => candidate.getAttribute('data-urn') ?? candidate.getAttribute('data-id') ?? candidate.id)
      .join('|')
    const selectedStableId = selected?.getAttribute('data-modaicom-stable-id')
    const currentStableId = selected?.getAttribute('data-urn') ?? selected?.getAttribute('data-id')
    if (!session || !snapshot || selectedCandidate.length !== 1 || selected?.getAttribute('data-modaicom-selected-token') !== session || snapshot !== currentSnapshot) {
      cleanupFeedSelection()
      return { kind: 'stale-target' }
    }
    if (selectedStableId && currentStableId !== selectedStableId) {
      cleanupFeedSelection()
      return { kind: 'stale-target' }
    }
    if (!selected || !candidates.includes(selected)) {
      cleanupFeedSelection()
      return { kind: 'stale-target' }
    }
  }

  if (candidates.length === 0) {
    return { kind: 'post-not-found' }
  }
  if (!isFeedRoute && candidates.length !== 1) {
    return { kind: 'ambiguous-post' }
  }
  const [candidate] = isFeedRoute ? selectedCandidate : candidates
  if (!candidate) {
    if (isFeedRoute) cleanupFeedSelection()
    return { kind: isFeedRoute ? 'stale-target' : 'post-not-found' }
  }

  const belongsToCandidate = (element: Element) =>
    element.closest(candidateSelector) === candidate ||
    (candidate.matches('article') && !element.closest(candidateSelector))

  const bodySelectors = [
    '[data-testid="post-body"]',
    '[data-testid="expandable-text-box"]',
    '[data-test-id="feed-shared-update-v2__description"]',
    '.feed-shared-update-v2__description',
    '.feed-shared-inline-show-more-text',
  ]

  const findElement = (selectors: string[]) => {
    for (const selector of selectors) {
      const element = Array.from(
        candidate.querySelectorAll<HTMLElement>(selector),
      ).find(belongsToCandidate)
      if (element) return element
    }
    return undefined
  }

  const normalizeText = (element: Element) => {
    let rawText = ''
    const blockTags = new Set([
      'ADDRESS',
      'ARTICLE',
      'ASIDE',
      'BLOCKQUOTE',
      'DIV',
      'FIGCAPTION',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'LI',
      'P',
      'PRE',
      'SECTION',
    ])

    const visit = (node: Node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          rawText += child.textContent ?? ''
          return
        }
        if (child.nodeType === Node.ELEMENT_NODE) {
          const childElement = child as Element
          const isBlock = blockTags.has(childElement.tagName)
          if (isBlock && rawText && !rawText.endsWith('\n')) {
            rawText += '\n'
          }
          visit(child)
          if (isBlock && !rawText.endsWith('\n')) {
            rawText += '\n'
          }
        }
      })
    }
    visit(element)

    return rawText
      .replace(/\u00a0/g, ' ')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  const authoredBody = findElement(bodySelectors)
  const hasSeeMore = authoredBody
    ? Array.from(
        authoredBody.querySelectorAll<HTMLElement>(
          'button, a, [role="button"]',
        ),
      ).some((control) => /\bsee\s+more\b/i.test(control.textContent?.trim() ?? ''))
    : false
  if (hasSeeMore) {
    cleanupFeedSelection()
    return { kind: 'collapsed-post' }
  }

  const textFrom = (selectors: string[]) => {
    const element = findElement(selectors)
    if (!element) return undefined
    const text =
      normalizeText(element) || element.getAttribute('aria-label')?.trim()
    return text || undefined
  }

  const authorDisplayName = textFrom([
    '[data-testid="actor-name"]',
    '[data-test-id="feed-shared-actor__name"]',
    '[aria-label^="By "]',
  ])?.replace(/^By\s+/i, '')
  if (!authorDisplayName) {
    cleanupFeedSelection()
    return { kind: 'author-not-found' }
  }

  const originalAuthoredText = authoredBody
    ? normalizeText(authoredBody) || undefined
    : undefined
  if (!originalAuthoredText) {
    cleanupFeedSelection()
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

  cleanupFeedSelection()

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

const postFailureKinds = new Set<PostExtractionResult['kind']>([
  'unsupported-surface',
  'post-not-found',
  'ambiguous-post',
  'collapsed-post',
  'no-text',
  'author-not-found',
  'unexpected-error',
  'stale-target',
  'cancelled',
  'no-candidates',
  'ambiguous-candidates',
  'selection-failure',
])

export function isPostExtractionResult(value: unknown): value is PostExtractionResult {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.kind === 'success') {
    if (!candidate.context || typeof candidate.context !== 'object') return false
    const context = candidate.context as Record<string, unknown>
    if (
      typeof context.authorDisplayName !== 'string' ||
      !context.authorDisplayName.trim() ||
      typeof context.originalAuthoredText !== 'string' ||
      !context.originalAuthoredText.trim()
    ) {
      return false
    }
    return ['authorHeadline', 'stablePostIdentifier', 'publicationTimeLabel'].every(
      (key) =>
        context[key] === undefined ||
        (typeof context[key] === 'string' && context[key].trim().length > 0),
    )
  }
  return typeof candidate.kind === 'string' && postFailureKinds.has(candidate.kind as PostExtractionResult['kind'])
}

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
    const runtimeResult: unknown = injection?.result
    return isPostExtractionResult(runtimeResult)
      ? runtimeResult
      : { kind: 'unexpected-error' }
  } catch {
    return { kind: 'unexpected-error' }
  }
}

