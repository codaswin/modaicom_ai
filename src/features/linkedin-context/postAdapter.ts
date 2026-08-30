// LinkedIn ships two distinct feed implementations at the time of writing:
//
//  - Legacy markup (still used on individual `/posts/...` and activity permalink
//    pages): `article` / `.feed-shared-update-v2` roots carrying a
//    `urn:li:activity:` identifier in `data-urn` / `data-id`.
//  - Server-driven UI ("SDUI") markup (the logged-in home `/feed/`): obfuscated
//    class names, no activity URN anywhere in the DOM, posts rendered as
//    `[role="listitem"]` inside a `[data-testid="mainFeed"]` list. The framework
//    reconciliation key (`componentkey`) is the only per-post stable handle and
//    it only lasts for the page session.
//
// Both regimes are recognised here so the inline trigger can appear on the feed
// without weakening the individual-post guarantees.

const LEGACY_FEED_CONTAINER_SELECTOR = 'main [role="feed"], main .scaffold-finite-scroll__content'
export const SDUI_FEED_CONTAINER_SELECTOR = 'main [data-testid="mainFeed"]'
export const FEED_CONTAINER_SELECTOR = `${LEGACY_FEED_CONTAINER_SELECTOR}, ${SDUI_FEED_CONTAINER_SELECTOR}`

const LEGACY_FEED_POST_ROOT_SELECTOR =
  'article[data-urn^="urn:li:activity:"], article[data-id^="urn:li:activity:"], .feed-shared-update-v2[data-urn^="urn:li:activity:"], .feed-shared-update-v2[data-id^="urn:li:activity:"]'
// SDUI feed posts are list items; the containing-feed relationship is always
// verified separately (see `isSduiFeedPostRoot`) rather than baked into a
// selector, so this stays usable with `.matches()` and element-scoped queries.
export const SDUI_FEED_POST_ROOT_SELECTOR = '[role="listitem"]'
export const FEED_POST_ROOT_SELECTOR = `${LEGACY_FEED_POST_ROOT_SELECTOR}, ${SDUI_FEED_POST_ROOT_SELECTOR}`

export const POST_ROOT_SELECTOR =
  'article[data-urn], article[data-id], [data-urn^="urn:li:activity:"], [data-id^="urn:li:activity:"]'

export const ORIGINAL_BODY_SELECTORS = [
  '[data-testid="post-body"]',
  '[data-testid="expandable-text-box"]',
  '[data-view-name="feed-commentary"]',
  '[data-test-id="feed-shared-update-v2__description"]',
  '.feed-shared-update-v2__description',
  '.feed-shared-inline-show-more-text',
  '.update-components-text',
]

// The "see more" affordance the SDUI feed renders inside a collapsed post body.
export const SDUI_EXPAND_CONTROL_SELECTOR = '[data-testid="expandable-text-button"]'

export function feedContainerVariant(root: Element): string | undefined {
  if (root.matches('main [role="feed"]')) return 'role-feed'
  if (root.matches('main .scaffold-finite-scroll__content')) return 'scaffold-finite-scroll'
  if (root.matches(SDUI_FEED_CONTAINER_SELECTOR)) return 'sdui-main-feed'
  return undefined
}

export function postRootVariant(root: Element): string | undefined {
  if (root.matches('article[data-urn^="urn:li:activity:"], article[data-id^="urn:li:activity:"]')) return 'article'
  if (root.matches('.feed-shared-update-v2[data-urn^="urn:li:activity:"], .feed-shared-update-v2[data-id^="urn:li:activity:"]'))
    return 'feed-shared-update-v2'
  if (root.matches(SDUI_FEED_POST_ROOT_SELECTOR)) return 'sdui-feed-listitem'
  return undefined
}

export function isSduiFeedPostRoot(post: Element): boolean {
  return (
    post.matches(SDUI_FEED_POST_ROOT_SELECTOR) &&
    Boolean(post.closest(SDUI_FEED_CONTAINER_SELECTOR)) &&
    !post.parentElement?.closest('[role="listitem"]')
  )
}

export function stablePostIdentity(post: Element): string | undefined {
  const urn = post.getAttribute('data-urn') ?? post.getAttribute('data-id')
  if (urn?.trim()) return urn.trim()
  // SDUI feed posts carry no activity URN. The framework reconciliation key on
  // the list item (or its wrapper) is unique per post and stable for the page
  // session, which is all the inline-trigger deduplication needs.
  const componentKey = post.getAttribute('componentkey') ?? post.parentElement?.getAttribute('componentkey') ?? undefined
  return componentKey?.trim() || undefined
}

export function isValidatedPostRoot(post: Element, feed = false): boolean {
  const selector = feed ? FEED_POST_ROOT_SELECTOR : POST_ROOT_SELECTOR
  if (!post.matches(selector)) return false
  if (!findOriginalBody(post)) return false
  if (post.matches(SDUI_FEED_POST_ROOT_SELECTOR)) return isSduiFeedPostRoot(post)
  return Boolean(stablePostIdentity(post))
}

export function findOriginalBody(post: Element): HTMLElement | undefined {
  // A body element "belongs" to this post when it is not nested inside another
  // recognised post root (legacy URN root or an SDUI feed list item), so shared
  // and quoted post bodies are never mistaken for the primary post's text.
  const nestedRootSelector = `${POST_ROOT_SELECTOR}, ${SDUI_FEED_POST_ROOT_SELECTOR}`
  return Array.from(post.querySelectorAll<HTMLElement>(ORIGINAL_BODY_SELECTORS.join(','))).find((element) => {
    const nested = element.closest(nestedRootSelector)
    return nested === post || !nested
  })
}
