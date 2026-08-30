// An activity-URN-bearing post root. `POST_ROOT_SELECTOR` also matches
// `article[data-id]`, which a comment `<article>` satisfies, so it cannot be
// used to walk from a comment up to its post.
const ACTIVITY_POST_ROOT_SELECTOR =
  '.feed-shared-update-v2[data-urn^="urn:li:activity:"], .feed-shared-update-v2[data-id^="urn:li:activity:"], article[data-urn^="urn:li:activity:"], article[data-id^="urn:li:activity:"], [data-urn^="urn:li:activity:"], [data-id^="urn:li:activity:"]'

// Phase 4 — conservative structural allowlist for LinkedIn Comment roots, bodies,
// authors, and collapse controls. `legacy` markup only; unknown markup fails
// closed. See ADR-0006 and docs/testing/linkedin-selectors.md.
export const COMMENT_ADAPTER_VERSION = 1 as const

export const LEGACY_COMMENT_ROOT_SELECTOR =
  'article.comments-comment-entity[data-id*="urn:li:comment:"], article.comments-comment-item[data-id*="urn:li:comment:"], article[data-id*="urn:li:comment:"]'

// SDUI comments carry the URN in a hashed id / componentkey but expose no
// structural reply→comment link, so comment-reply is not supported there.
export const SDUI_COMMENT_MARKER_SELECTOR =
  '[id*="urn:li:comment:"], [componentkey*="urn:li:comment:"]'

// The commenter's authored-text region (never the comment card's raw text).
const COMMENT_BODY_SELECTORS = [
  '.comments-comment-item__main-content',
  '.comments-comment-entity__content',
  '.comments-comment-item-content-body',
  '.feed-shared-inline-show-more-text',
  '.update-components-text',
]
const COMMENT_AUTHOR_SELECTORS = [
  '.comments-comment-meta__description-title',
  '.comments-comment-item__actor-name',
  '.comments-post-meta__name-text',
  '.comments-comment-meta__actor .hoverable-link-text',
]
const COMMENT_EXPAND_CONTROL_SELECTOR =
  '.comments-comment-item__inline-show-more-text, .feed-shared-inline-show-more-text button, [aria-expanded="false"][class*="show-more" i]'

export type CommentMarkupRegime = 'legacy' | 'sdui' | 'unknown'

export function commentMarkupRegime(root: Document | Element = document): CommentMarkupRegime {
  if (root.querySelector(LEGACY_COMMENT_ROOT_SELECTOR)) return 'legacy'
  if (root.querySelector(SDUI_COMMENT_MARKER_SELECTOR)) return 'sdui'
  return 'unknown'
}

export function commentStableIdentity(comment: Element): string | undefined {
  const raw = comment.getAttribute('data-id') ?? comment.getAttribute('id') ?? comment.getAttribute('componentkey') ?? ''
  return raw.match(/urn:li:comment:\([^)]*\)|urn:li:comment:[^\s"']+/)?.[0]
}

// The nearest legacy Comment root that contains this element.
export function legacyCommentRoot(element: Element): HTMLElement | undefined {
  return element.closest<HTMLElement>(LEGACY_COMMENT_ROOT_SELECTOR) ?? undefined
}

export function isValidatedCommentRoot(comment: Element): boolean {
  return comment.matches(LEGACY_COMMENT_ROOT_SELECTOR) && Boolean(commentStableIdentity(comment))
}

// The single validated Owning Post that directly owns this comment. Rejects a
// comment that resolves to a nested/shared post rather than the outermost one.
export function commentOwningPost(comment: Element): HTMLElement | undefined {
  const owner = comment.closest<HTMLElement>(ACTIVITY_POST_ROOT_SELECTOR)
  if (!owner) return undefined
  const outerOwner = owner.parentElement?.closest<HTMLElement>(ACTIVITY_POST_ROOT_SELECTOR)
  return outerOwner ? undefined : owner
}

function belongsToComment(element: Element, comment: Element): boolean {
  const nested = element.closest(LEGACY_COMMENT_ROOT_SELECTOR)
  return nested === comment || !nested
}

export function commentBody(comment: Element): HTMLElement | undefined {
  for (const selector of COMMENT_BODY_SELECTORS) {
    const el = Array.from(comment.querySelectorAll<HTMLElement>(selector)).find((candidate) =>
      belongsToComment(candidate, comment),
    )
    if (el) return el
  }
  return undefined
}

export function commentAuthorElement(comment: Element): HTMLElement | undefined {
  for (const selector of COMMENT_AUTHOR_SELECTORS) {
    const el = Array.from(comment.querySelectorAll<HTMLElement>(selector)).find((candidate) =>
      belongsToComment(candidate, comment),
    )
    if (el) return el
  }
  return undefined
}

export function commentBodyIsCollapsed(body: Element): boolean {
  if (body.querySelector(COMMENT_EXPAND_CONTROL_SELECTOR)) return true
  return Array.from(body.querySelectorAll<HTMLElement>('button, a, [role="button"]')).some((control) =>
    /\bsee\s+more\b|…\s*more$/i.test(control.textContent?.trim() ?? ''),
  )
}

// Best-effort trailing chrome removal from a comment author line. The name is
// link text so "wrong" is not possible — only "noisy" — and stripping is
// English-dependent.
export function normalizeCommentAuthor(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s*[•·].*$/, '')
    .replace(/\s+\d(?:st|nd|rd|th)\+?$/i, '')
    .replace(/\s+(?:Author|Following|Follow|Verified Profile|• 1st|• 2nd|• 3rd\+?)\s*$/i, '')
    .trim()
}
