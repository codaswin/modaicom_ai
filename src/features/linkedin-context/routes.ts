export type SupportedLinkedInRoute = 'feed' | 'individual' | 'unsupported'

const individualPostPath = /^\/posts\/[^/]+\/?$/
const activityPath = /^\/feed\/update\/urn:li:activity:[^/]+\/?$/

export function classifyLinkedInRoute(urlString: string): SupportedLinkedInRoute {
  try {
    const url = new URL(urlString)
    if (url.protocol !== 'https:' || (url.hostname !== 'linkedin.com' && url.hostname !== 'www.linkedin.com')) return 'unsupported'
    if (url.pathname === '/feed/') return 'feed'
    if (individualPostPath.test(url.pathname) || activityPath.test(url.pathname)) return 'individual'
    return 'unsupported'
  } catch { return 'unsupported' }
}

export function isSupportedLinkedInUrl(urlString: string): boolean { return classifyLinkedInRoute(urlString) !== 'unsupported' }
export function isSupportedFeedUrl(urlString: string): boolean { return classifyLinkedInRoute(urlString) === 'feed' }
