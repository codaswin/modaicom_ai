import { describe, expect, it } from 'vitest'

import { composerIsEligible, isSupportedRoute, observationScopes, postCandidates } from './inlineTrigger'

describe('inline trigger content boundary', () => {
  it('supports only the feed and recognized individual-post routes', () => {
    expect(isSupportedRoute('https://www.linkedin.com/feed/')).toBe(true)
    expect(isSupportedRoute('https://linkedin.com/posts/example')).toBe(true)
    expect(isSupportedRoute('https://linkedin.com/feed/update/urn:li:activity:1')).toBe(true)
    expect(isSupportedRoute('https://linkedin.com/in/example')).toBe(false)
    expect(isSupportedRoute('https://learning.linkedin.com/feed/')).toBe(false)
  })

  it('requires a genuine comment composer marker and rejects unrelated editables', () => {
    const search = document.createElement('textarea')
    search.setAttribute('aria-label', 'Search')
    const postComposer = document.createElement('div')
    postComposer.setAttribute('contenteditable', 'true')
    postComposer.setAttribute('placeholder', 'Start a post')
    const genuineRoot = document.createElement('div')
    genuineRoot.setAttribute('data-testid', 'comment-composer')
    const genuine = document.createElement('div')
    genuine.setAttribute('contenteditable', 'true')
    genuineRoot.append(genuine)
    document.body.append(genuineRoot)
    const owned = document.createElement('div')
    owned.setAttribute('contenteditable', 'true')
    owned.setAttribute('data-modaicom-inline-wrapper', '')
    expect(composerIsEligible(genuine)).toBe(true)
    expect(composerIsEligible(search)).toBe(false)
    expect(composerIsEligible(postComposer)).toBe(false)
    expect(composerIsEligible(owned)).toBe(false)
  })
})

  it('excludes unrelated activity cards and observes only the feed container', () => {
    const main = document.createElement('main')
    const feed = document.createElement('div')
    feed.setAttribute('role', 'feed')
    const valid = document.createElement('article')
    valid.setAttribute('data-urn', 'urn:li:activity:1')
    const body = document.createElement('div')
    body.setAttribute('data-testid', 'post-body')
    valid.append(body)
    const unrelated = document.createElement('article')
    unrelated.setAttribute('data-urn', 'urn:li:activity:2')
    feed.append(valid, unrelated)
    main.append(feed)
    document.body.append(main)
    expect(postCandidates(document, 'https://www.linkedin.com/feed/')).toEqual([valid])
    expect(observationScopes('https://www.linkedin.com/feed/')).toContain(feed)
    expect(observationScopes('https://www.linkedin.com/feed/')).not.toContain(document.body)
    main.remove()
  })
