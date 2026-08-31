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

  // Returns the text of the first element — across every selector, in order —
  // that both belongs to this post and actually has text. Not `findElement`,
  // which stops at the first *matching* element even when it is empty (a
  // decorative `aria-hidden` span can sort before the real one).
  const textFrom = (selectors: string[]) => {
    for (const selector of selectors) {
      for (const element of Array.from(candidate.querySelectorAll<HTMLElement>(selector))) {
        if (!belongsToCandidate(element)) continue
        const text = normalizeText(element) || element.getAttribute('aria-label')?.trim()
        if (text) return text
      }
    }
    return undefined
  }

  // LinkedIn's actor block prints each string twice — once visibly, once for
  // screen readers — often with no separator ("HeadlineHeadline"). Collapse an
  // exact repeat.
  const collapseDoubled = (line: string): string => {
    const half = line.length / 2
    return Number.isInteger(half) && half > 0 && line.slice(0, half) === line.slice(half)
      ? line.slice(0, half)
      : line
  }

  const firstNonEmptyLine = (raw: string | undefined): string =>
    raw?.split('\n').map((line) => line.trim()).find(Boolean) ?? ''

  // A person's name additionally carries connection-degree / "Verified" chrome
  // ("Ada Lovelace Ada Lovelace • 1st Verified"). Strip the chrome *first*, then
  // collapse the exact repeat — so a legitimately reduplicated name ("Yang
  // Yang", "Duran Duran") is only ever collapsed when both halves are byte-
  // identical, never rewritten by a lazy back-reference. The chrome patterns are
  // deliberately narrow: a spaced bullet, or a trailing bare 1st/2nd/3rd — so
  // "Studio 21st Century" and "Nike | Just Do It" pass through untouched.
  const cleanActorName = (raw: string | undefined): string | undefined => {
    if (!raw) return undefined
    const stripped = firstNonEmptyLine(raw)
      .replace(/^By\s+/i, '')
      .replace(/\s+[•·]\s.*$/, '')
      .replace(/\s+[123](?:st|nd|rd)\+?\s*$/i, '')
      .replace(/\s*\bVerified\b\s*/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return collapseDoubled(stripped).trim() || undefined
  }

  const cleanActorLine = (raw: string | undefined): string | undefined =>
    raw ? collapseDoubled(firstNonEmptyLine(raw)).trim() || undefined : undefined

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
    return cleanActorName(normalizeText(actorLink))
  }

  const authorDisplayName = cleanActorName(
    textFrom([
      '[data-testid="actor-name"]',
      '[data-test-id="feed-shared-actor__name"]',
      '.update-components-actor__name',
      // Current LinkedIn actor markup (activity permalink / individual post):
      // the clean name is the screen-reader/visible span pair inside the title.
      '.update-components-actor__title span[aria-hidden="true"]',
      '.update-components-actor__title',
      '[data-view-name="feed-actor-name"]',
      '[aria-label^="By "]',
    ]) ?? sduiAuthorName(),
  )
  if (!authorDisplayName) {
    return { kind: 'author-not-found' }
  }

  const originalAuthoredText = authoredBody
    ? normalizeText(authoredBody) || undefined
    : undefined
  if (!originalAuthoredText) {
    return { kind: 'no-text' }
  }

  const authorHeadline = cleanActorLine(
    textFrom([
      '[data-testid="actor-headline"]',
      '[data-test-id="feed-shared-actor__description"]',
      '.update-components-actor__description',
    ]),
  )
  // `<time>` is the reliable, already-clean source on current markup. The
  // sub-description block ("1d • 1 day ago • Visible to anyone…", visible + SR
  // copies mashed with no separator) is deliberately not used — it garbles more
  // often than it helps, and this label is cosmetic.
  const rawTimeLabel = textFrom(['time', '[data-testid="post-time"]', '[data-test-id="feed-shared-actor__sub-description"]'])
  const publicationTimeLabel = rawTimeLabel
    ? firstNonEmptyLine(rawTimeLabel).split(/\s+[•·]\s/)[0]!.trim() || undefined
    : undefined

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


