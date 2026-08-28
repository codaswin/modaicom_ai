export const FEED_CONTAINER_SELECTOR = 'main [role="feed"], main .scaffold-finite-scroll__content'
export const FEED_POST_ROOT_SELECTOR = 'article[data-urn^="urn:li:activity:"], article[data-id^="urn:li:activity:"], .feed-shared-update-v2[data-urn^="urn:li:activity:"], .feed-shared-update-v2[data-id^="urn:li:activity:"]'
export const POST_ROOT_SELECTOR = 'article[data-urn], article[data-id], [data-urn^="urn:li:activity:"], [data-id^="urn:li:activity:"]'
export const ORIGINAL_BODY_SELECTORS = [
  '[data-testid="post-body"]',
  '[data-testid="expandable-text-box"]',
  '[data-test-id="feed-shared-update-v2__description"]',
  '.feed-shared-update-v2__description',
  '.feed-shared-inline-show-more-text',
  '.update-components-text',
]

export function feedContainerVariant(root: Element): string | undefined {
  if (root.matches('main [role="feed"]')) return 'role-feed'
  if (root.matches('main .scaffold-finite-scroll__content')) return 'scaffold-finite-scroll'
  return undefined
}

export function postRootVariant(root: Element): string | undefined {
  if (root.matches('article[data-urn^="urn:li:activity:"], article[data-id^="urn:li:activity:"]')) return 'article'
  if (root.matches('.feed-shared-update-v2[data-urn^="urn:li:activity:"], .feed-shared-update-v2[data-id^="urn:li:activity:"]')) return 'feed-shared-update-v2'
  return undefined
}

export function stablePostIdentity(post: Element): string | undefined {
  const value = post.getAttribute('data-urn') ?? post.getAttribute('data-id')
  return value?.trim() || undefined
}

export function isValidatedPostRoot(post: Element, feed = false): boolean {
  const selector = feed ? FEED_POST_ROOT_SELECTOR : POST_ROOT_SELECTOR
  return post.matches(selector) && Boolean(stablePostIdentity(post)) && Boolean(post.querySelector(ORIGINAL_BODY_SELECTORS.join(',')))
}

export function findOriginalBody(post: Element): HTMLElement | undefined {
  return Array.from(post.querySelectorAll<HTMLElement>(ORIGINAL_BODY_SELECTORS.join(','))).find((element) => {
    const nested = element.closest(POST_ROOT_SELECTOR)
    return nested === post || !nested
  })
}
