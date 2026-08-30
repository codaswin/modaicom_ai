import { classifyLinkedInRoute } from './routes'
import { FEED_CONTAINER_SELECTOR, FEED_POST_ROOT_SELECTOR, POST_ROOT_SELECTOR, ORIGINAL_BODY_SELECTORS, SDUI_EXPAND_CONTROL_SELECTOR, SDUI_FEED_POST_ROOT_SELECTOR, findOriginalBody, isValidatedPostRoot, stablePostIdentity } from './postAdapter'

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

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'FIGCAPTION',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'P', 'PRE', 'SECTION',
])

// Collects authored text from an element: preserves meaningful paragraph breaks,
// collapses incidental whitespace, and drops elements matching `excludeSelector`
// (expand toggles and similar chrome). Language-agnostic — never parses or
// translates.
export function normalizeLinkedInText(element: Element, excludeSelector?: string): string {
  let rawText = ''
  const visit = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        rawText += child.textContent ?? ''
        return
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const childElement = child as Element
      if (excludeSelector && childElement.matches(excludeSelector)) return
      const isBlock = BLOCK_TAGS.has(childElement.tagName)
      if (isBlock && rawText && !rawText.endsWith('\n')) rawText += '\n'
      visit(child)
      if (isBlock && !rawText.endsWith('\n')) rawText += '\n'
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

  const normalizeText = (element: Element) => normalizeLinkedInText(element, SDUI_EXPAND_CONTROL_SELECTOR)
  const authoredBody = findOriginalBody(candidate) ?? findElement(bodySelectors)
  const isCollapsed = authoredBody
    ? // SDUI feed: the expander is a dedicated control that LinkedIn *removes*
      // (not relabels) once the post is expanded, so its presence is a
      // locale-independent "collapsed" signal.
      Boolean(authoredBody.querySelector(SDUI_EXPAND_CONTROL_SELECTOR)) ||
      // Legacy feed / post pages: fall back to the visible control text.
      Array.from(authoredBody.querySelectorAll<HTMLElement>('button, a, [role="button"]')).some((control) =>
        /\bsee\s+more\b/i.test(control.textContent?.trim() ?? ''),
      )
    : false
  if (isCollapsed) {
    return { kind: 'collapsed-post' }
  }

  const textFrom = (selectors: string[]) => {
    const element = findElement(selectors)
    if (!element) return undefined
    const text =
      normalizeText(element) || element.getAttribute('aria-label')?.trim()
    return text || undefined
  }

  const sduiAuthorName = () => {
    if (!candidate.matches(SDUI_FEED_POST_ROOT_SELECTOR)) return undefined
    const apostrophe = "['’‘ʼ]"
    const viewProfile = new RegExp(`^View\\s+(.+?)${apostrophe}s\\s+(?:profile|photo|graphic link)$`, 'i')
    const profilePhoto = new RegExp(`^(.+?)${apostrophe}s\\s+(?:profile|graphic link)$`, 'i')
    for (const image of Array.from(candidate.querySelectorAll<HTMLElement>('img[alt]'))) {
      const alt = image.getAttribute('alt')?.trim() ?? ''
      const named = alt.match(viewProfile) ?? alt.match(profilePhoto)
      if (named?.[1]) return named[1].trim()
    }
    const actorLink = Array.from(
      candidate.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"], a[href*="/company/"], a[href*="/school/"]'),
    ).find((link) => (link.textContent ?? '').trim().length > 0)
    if (!actorLink) return undefined
    const cleaned = (normalizeText(actorLink).split('\n')[0] ?? '')
      .replace(/\s*[•·].*$/, '')
      .replace(/\s+\d(?:st|nd|rd|th)\+?$/i, '')
      .trim()
    return cleaned || undefined
  }

  const authorDisplayName = (textFrom([
    '[data-testid="actor-name"]',
    '[data-test-id="feed-shared-actor__name"]',
    '.update-components-actor__name',
    '[data-view-name="feed-actor-name"]',
    '[aria-label^="By "]',
  ]) ?? sduiAuthorName())?.replace(/^By\s+/i, '')
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

export function isExtractedPostContext(value: unknown): value is ExtractedPostContext {
  if (!value || typeof value !== 'object') return false
  const context = value as Record<string, unknown>
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
      (typeof context[key] === 'string' && (context[key] as string).trim().length > 0),
  )
}

export function isPostExtractionResult(value: unknown): value is PostExtractionResult {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.kind === 'success') return isExtractedPostContext(candidate.context)
  return typeof candidate.kind === 'string' && postFailureKinds.has(candidate.kind as PostExtractionResult['kind'])
}


