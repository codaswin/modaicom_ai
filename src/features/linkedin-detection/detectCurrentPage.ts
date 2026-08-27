export type DetectionResult =
  | { kind: 'linkedin' }
  | { kind: 'other' }
  | { kind: 'error' }

export async function detectCurrentPage(): Promise<DetectionResult> {
  let activeTab: chrome.tabs.Tab | undefined

  try {
    ;[activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  } catch (error) {
    console.error('LinkedIn detection failed', error)
    return { kind: 'error' }
  }

  if (!activeTab?.url) {
    return { kind: 'error' }
  }

  let url: URL

  try {
    url = new URL(activeTab.url)
  } catch {
    console.error('LinkedIn detection failed: malformed active-tab URL')
    return { kind: 'error' }
  }

  const isSupportedHostname =
    url.hostname === 'linkedin.com' || url.hostname === 'www.linkedin.com'
  const isSupported = url.protocol === 'https:' && isSupportedHostname

  return { kind: isSupported ? 'linkedin' : 'other' }
}
