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
