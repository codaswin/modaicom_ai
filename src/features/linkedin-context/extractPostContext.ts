import { classifyLinkedInRoute } from './routes'
import { FEED_CONTAINER_SELECTOR, FEED_POST_ROOT_SELECTOR, POST_ROOT_SELECTOR, ORIGINAL_BODY_SELECTORS, findOriginalBody, isValidatedPostRoot, stablePostIdentity } from './postAdapter'

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
  root: Document | Element = document,
  currentUrl: string = location.href,
): PostExtractionResult {
  let url: URL
  try {
    url = new URL(currentUrl)
  } catch {
    return { kind: 'unexpected-error' }
  }
  const route = classifyLinkedInRoute(currentUrl)
  const isFeedRoute = route === 'feed'

  if (route === 'unsupported') {
    return { kind: 'unsupported-surface' }
  }

  if (isFeedRoute && root.nodeType === Node.DOCUMENT_NODE) return { kind: 'unsupported-surface' }
  if (root.nodeType === Node.ELEMENT_NODE && !isValidatedPostRoot(root as Element, isFeedRoute)) return { kind: 'post-not-found' }

  const candidateSelector = isFeedRoute
    ? FEED_POST_ROOT_SELECTOR
    : POST_ROOT_SELECTOR
  const isElementRoot = root.nodeType === Node.ELEMENT_NODE
  const pageDocument = root.nodeType === Node.DOCUMENT_NODE ? (root as Document) : root.ownerDocument
  const candidateRoot = isFeedRoute
    ? (isElementRoot ? root : pageDocument?.querySelector<HTMLElement>(FEED_CONTAINER_SELECTOR))
    : root
  const markedCandidates = isElementRoot
    ? [root as HTMLElement]
    : Array.from(candidateRoot?.querySelectorAll<HTMLElement>(candidateSelector) ?? [])
  const candidates = markedCandidates.length
    ? markedCandidates.filter(
        (candidate) =>
          !candidate.parentElement?.closest(candidateSelector),
      )
    : isFeedRoute
      ? []
      : Array.from(root.querySelectorAll<HTMLElement>('article'))

  if (candidates.length === 0) {
    return { kind: 'post-not-found' }
  }
  if (!isFeedRoute && candidates.length !== 1) {
    return { kind: 'ambiguous-post' }
  }
  const [candidate] = candidates
  if (!candidate) {
    return { kind: 'post-not-found' }
  }

  const belongsToCandidate = (element: Element) =>
    element.closest(candidateSelector) === candidate ||
    (candidate.matches('article') && !element.closest(candidateSelector))

  const bodySelectors = ORIGINAL_BODY_SELECTORS

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

  const authoredBody = findOriginalBody(candidate) ?? findElement(bodySelectors)
  const hasSeeMore = authoredBody
    ? Array.from(
        authoredBody.querySelectorAll<HTMLElement>(
          'button, a, [role="button"]',
        ),
      ).some((control) => /\bsee\s+more\b/i.test(control.textContent?.trim() ?? ''))
    : false
  if (hasSeeMore) {
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
    return { kind: 'author-not-found' }
  }

  const originalAuthoredText = authoredBody
    ? normalizeText(authoredBody) || undefined
    : undefined
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

  const explicitIdentifier = stablePostIdentity(candidate)
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

export function extractPostContextFromElementInPage(
  root: Element,
  currentUrl: string = location.href,
): PostExtractionResult {
  return extractPostContextInPage(root, currentUrl)
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

