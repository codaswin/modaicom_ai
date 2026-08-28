import { describe, expect, it } from 'vitest'

import { composerIsEligible, isSupportedRoute, observationScopes, postCandidates, reconcile } from './inlineTrigger'

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
    genuineRoot.remove()
  })

  it('recognizes the current labelled LinkedIn comment editor structure', () => {
    const root = document.createElement('div')
    root.className = 'comments-comment-box'
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.setAttribute('aria-label', 'Add a comment')
    root.append(editor)
    document.body.append(root)
    expect(composerIsEligible(editor)).toBe(true)
    root.remove()
  })

  it('rejects reply editors even with a generic comment label', () => {
    const reply = document.createElement('div')
    reply.className = 'comments-comment-box reply'
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.setAttribute('aria-label', 'Add a comment')
    reply.append(editor)
    document.body.append(reply)
    expect(composerIsEligible(editor)).toBe(false)
    reply.remove()
  })

  it('recognizes the current LinkedIn scaffold feed and labelled editor structure', () => {
    const main = document.createElement('main')
    const feed = document.createElement('div')
    feed.className = 'scaffold-finite-scroll__content'
    const post = document.createElement('div')
    post.className = 'feed-shared-update-v2'
    post.setAttribute('data-urn', 'urn:li:activity:current')
    const body = document.createElement('div')
    body.className = 'feed-shared-update-v2__description'
    const composer = document.createElement('div')
    composer.className = 'comments-comment-box'
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.setAttribute('aria-label', 'Add a comment')
    composer.append(editor)
    post.append(body, composer)
    feed.append(post)
    main.append(feed)
    document.body.append(main)
    expect(postCandidates(document, 'https://www.linkedin.com/feed/')).toEqual([post])
    expect(composerIsEligible(editor)).toBe(true)
    reconcile('https://www.linkedin.com/feed/')
    expect(document.querySelectorAll('[data-modaicom-inline-wrapper]').length).toBe(1)
    const laterPost = document.createElement('div')
    laterPost.className = 'feed-shared-update-v2'
    laterPost.setAttribute('data-urn', 'urn:li:activity:later')
    const laterBody = document.createElement('div')
    laterBody.className = 'feed-shared-update-v2__description'
    const laterComposer = document.createElement('div')
    laterComposer.className = 'comments-comment-box'
    const laterEditor = document.createElement('div')
    laterEditor.setAttribute('contenteditable', 'true')
    laterEditor.setAttribute('aria-label', 'Add a comment')
    laterComposer.append(laterEditor)
    laterPost.append(laterBody, laterComposer)
    feed.append(laterPost)
    expect(postCandidates(document, 'https://www.linkedin.com/feed/')).toEqual([post, laterPost])
    reconcile('https://www.linkedin.com/feed/')
    expect(document.querySelectorAll('[data-modaicom-inline-wrapper]').length).toBe(2)
    main.remove()
  })

  it('rejects nested activity roots and duplicate stable IDs', () => {
    const main = document.createElement('main')
    const feed = document.createElement('div')
    feed.className = 'scaffold-finite-scroll__content'
    const outer = document.createElement('div')
    outer.className = 'feed-shared-update-v2'
    outer.setAttribute('data-urn', 'urn:li:activity:outer')
    const outerBody = document.createElement('div')
    outerBody.className = 'feed-shared-update-v2__description'
    const nested = document.createElement('div')
    nested.className = 'feed-shared-update-v2'
    nested.setAttribute('data-urn', 'urn:li:activity:nested')
    const nestedBody = document.createElement('div')
    nestedBody.className = 'feed-shared-update-v2__description'
    nested.append(nestedBody)
    outer.append(outerBody, nested)
    const duplicate = outer.cloneNode(true) as HTMLElement
    feed.append(outer, duplicate)
    main.append(feed)
    document.body.append(main)
    expect(postCandidates(document, 'https://www.linkedin.com/feed/')).toEqual([])
    main.remove()
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
})
