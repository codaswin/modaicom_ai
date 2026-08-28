import { describe, expect, it } from 'vitest'

import {
  extractPostContextInPage,
} from './extractPostContext'
import {
  isSupportedFeedUrl,
  startFeedSelectionInPage,
} from './feedTargeting'

const feed = (posts: string) => `<main><div role="feed">${posts}</div></main>`
const post = (id: string, text = id, extra = '') =>
  `<article data-urn="urn:li:activity:${id}" ${extra}><span data-testid="actor-name">Ada Lovelace</span><div data-testid="post-body"><p>${text}</p></div></article>`

const start = (html: string) => {
  document.body.innerHTML = feed(html)
  return startFeedSelectionInPage(document, 'https://www.linkedin.com/feed/')
}

describe('feed targeting', () => {
  it('supports only the exact HTTPS /feed/ routes', () => {
    expect(isSupportedFeedUrl('https://www.linkedin.com/feed/?x=1#top')).toBe(true)
    expect(isSupportedFeedUrl('https://linkedin.com/feed/')).toBe(true)
    expect(isSupportedFeedUrl('https://linkedin.com/feed')).toBe(false)
    expect(isSupportedFeedUrl('https://learning.linkedin.com/feed/')).toBe(false)
    expect(isSupportedFeedUrl('https://linkedin.com/posts/example')).toBe(false)
  })

  it('adds controls only to top-level posts in the feed root', () => {
    expect(start(`<article data-urn="urn:li:activity:1"><div data-testid="post-body">Top</div><article data-urn="urn:li:activity:2"><div data-testid="post-body">Shared</div></article></article>${post('3', 'Second')}`)).toEqual({ kind: 'ready', count: 2 })
    expect(document.querySelectorAll('[data-modaicom-selection-control]')).toHaveLength(2)
    expect(document.querySelector('article[data-urn="urn:li:activity:2"] [data-modaicom-selection-control]')).toBeNull()
    expect(document.querySelectorAll('button[aria-label="Use this post"]')).toHaveLength(2)
  })

  it('rejects candidates outside the home-feed root', () => {
    document.body.innerHTML = `<main><aside>${post('9', 'Unrelated')}</aside></main>`
    expect(startFeedSelectionInPage(document, 'https://www.linkedin.com/feed/')).toEqual({ kind: 'no-candidates' })
  })

  it('returns no-candidates and ambiguous-candidates distinctly', () => {
    expect(start('')).toEqual({ kind: 'no-candidates' })
    expect(start(`${post('1', 'One')}${post('1', 'Duplicate')}`)).toEqual({ kind: 'ambiguous-candidates' })
  })

  it('creates unique candidate IDs and associates each control', () => {
    expect(start(`${post('1', 'One', 'id="same"')}${post('2', 'Two', 'id="same"')}`)).toEqual({ kind: 'ready', count: 2 })
    const candidates = Array.from(document.querySelectorAll('article'))
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(2)
    const button = document.querySelector('button[aria-label="Use this post"]')
    expect(button?.getAttribute('aria-describedby')).toBe(candidates[0]?.id)
  })

  it('marks exactly the clicked candidate and removes other controls', () => {
    start(`${post('1', 'One')}${post('2', 'Two')}`)
    const buttons = Array.from(document.querySelectorAll('button')).filter((button) => button.textContent === 'Use this post')
    buttons[1]?.click()
    expect(document.querySelector('[data-urn="urn:li:activity:2"]')).toHaveAttribute('data-modaicom-selected-token')
    expect(document.querySelectorAll('[data-modaicom-selection-control]')).toHaveLength(0)
  })

  it('extracts the selected feed post through the Phase 2 contract', () => {
    start(post('9', 'Selected text.'))
    const button = document.querySelector('button[aria-label="Use this post"]') as HTMLButtonElement
    button.click()
    expect(extractPostContextInPage(document, 'https://www.linkedin.com/feed/')).toEqual({
      kind: 'success',
      context: { authorDisplayName: 'Ada Lovelace', originalAuthoredText: 'Selected text.', stablePostIdentifier: 'urn:li:activity:9' },
    })
    expect(document.querySelector('[data-modaicom-selected-token]')).toBeNull()
  })

  it('returns stale-target for missing token, detached target, and snapshot mutation', () => {
    start(post('1', 'One'))
    expect(extractPostContextInPage(document, 'https://www.linkedin.com/feed/')).toEqual({ kind: 'stale-target' })

    start(`${post('1', 'One')}${post('2', 'Two')}`)
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent === 'Use this post') as HTMLButtonElement
    button.click()
    document.querySelector('article[data-urn="urn:li:activity:2"]')?.remove()
    expect(extractPostContextInPage(document, 'https://www.linkedin.com/feed/')).toEqual({ kind: 'stale-target' })
  })

  it('returns stale-target when the selected identifier changes', () => {
    start(post('1', 'One'))
    const button = document.querySelector('button[aria-label="Use this post"]') as HTMLButtonElement
    button.click()
    const candidate = document.querySelector('article[data-urn="urn:li:activity:1"]') as HTMLElement
    candidate.setAttribute('data-urn', 'urn:li:activity:changed')
    expect(extractPostContextInPage(document, 'https://www.linkedin.com/feed/')).toEqual({ kind: 'stale-target' })
  })

  it('removes controls and reports cancellation', () => {
    start(post('1', 'One'))
    const cancel = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Cancel selection') as HTMLButtonElement
    cancel.click()
    expect(document.querySelector('[data-modaicom-selection-control]')).toBeNull()
    expect(document.documentElement).toHaveAttribute('data-modaicom-selection-cancelled')
    expect(extractPostContextInPage(document, 'https://www.linkedin.com/feed/')).toEqual({ kind: 'cancelled' })
  })
})
