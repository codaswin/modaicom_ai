import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  extractInteractionContextInPage,
  requestPageInteractionContext,
  type ResolvedInteractionTarget,
} from './extractInteractionContext'
import { isInteractionExtractionResult } from './interactionContext'

const POST_MARKUP = `
  <div class="feed-shared-update-v2" data-urn="urn:li:activity:1">
    <div data-testid="actor-name">Ada Lovelace</div>
    <div data-testid="post-body">A useful post.</div>
    <div class="comments-comments-list">
      <article class="comments-comment-entity" data-id="urn:li:comment:(activity:1,10)">
        <span class="comments-comment-meta__description-title">Grace Hopper</span>
        <div class="comments-comment-item__main-content">Nice write-up, thanks @Ada Lovelace.</div>
      </article>
    </div>
  </div>
`

function build(markup = POST_MARKUP, url = 'https://www.linkedin.com/feed/update/urn:li:activity:1/') {
  const doc = new DOMParser().parseFromString(`<main>${markup}</main>`, 'text/html')
  const post = doc.querySelector('.feed-shared-update-v2') as Element
  const comment = doc.querySelector('article.comments-comment-entity') as Element
  return { doc, post, comment, url }
}

describe('extractInteractionContextInPage', () => {
  it('extracts a post-comment interaction', () => {
    const { post, url } = build()
    expect(extractInteractionContextInPage({ kind: 'post-comment', postElement: post }, url)).toMatchObject({
      kind: 'success',
      context: { kind: 'post-comment', post: { authorDisplayName: 'Ada Lovelace', originalAuthoredText: 'A useful post.' } },
    })
  })

  it('extracts a comment-reply interaction with the owning post preserved', () => {
    const { post, comment, url } = build()
    const target: ResolvedInteractionTarget = { kind: 'comment-reply', postElement: post, commentElement: comment }
    expect(extractInteractionContextInPage(target, url)).toMatchObject({
      kind: 'success',
      context: {
        kind: 'comment-reply',
        post: { authorDisplayName: 'Ada Lovelace', originalAuthoredText: 'A useful post.' },
        targetComment: { authorDisplayName: 'Grace Hopper', authoredText: 'Nice write-up, thanks @Ada Lovelace.' },
      },
    })
  })

  it('fails the whole interaction (never downgrades) when the owning post cannot be extracted', () => {
    const { doc, post, url } = build(`
      <div class="feed-shared-update-v2" data-urn="urn:li:activity:1">
        <article class="comments-comment-entity" data-id="urn:li:comment:(activity:1,10)">
          <span class="comments-comment-meta__description-title">Grace Hopper</span>
          <div class="comments-comment-item__main-content">Reply text.</div>
        </article>
      </div>`)
    const comment = doc.querySelector('article.comments-comment-entity') as Element
    // post has a comment but no authored body of its own -> the whole interaction
    // fails with the post-half failure, it does not fall back to post-comment
    expect(extractInteractionContextInPage({ kind: 'comment-reply', postElement: post, commentElement: comment }, url)).toEqual({
      kind: 'post-not-found',
    })
  })

  it.each([
    ['comment-not-found', `<span class="comments-comment-meta__description-title">A</span><div class="comments-comment-item__main-content">x</div>`, (c: Element) => c.removeAttribute('data-id')],
    ['comment-no-text', `<span class="comments-comment-meta__description-title">A</span>`, () => undefined],
    ['comment-author-not-found', `<div class="comments-comment-item__main-content">Just text.</div>`, () => undefined],
    ['comment-collapsed', `<span class="comments-comment-meta__description-title">A</span><div class="comments-comment-item__main-content">Long text <button class="comments-comment-item__inline-show-more-text">…more</button></div>`, () => undefined],
  ])('maps comment-half problem to %s', (expected, commentInner, mutate) => {
    const { doc, post, url } = build(`
      <div class="feed-shared-update-v2" data-urn="urn:li:activity:1">
        <div data-testid="actor-name">Ada</div><div data-testid="post-body">Post.</div>
        <article class="comments-comment-entity" data-id="urn:li:comment:(activity:1,10)">${commentInner}</article>
      </div>`)
    const comment = doc.querySelector('article.comments-comment-entity') as Element
    mutate(comment)
    expect(extractInteractionContextInPage({ kind: 'comment-reply', postElement: post, commentElement: comment }, url).kind).toBe(expected)
  })
})

describe('requestPageInteractionContext', () => {
  const query = vi.fn()
  const sendMessage = vi.fn()

  beforeEach(() => {
    query.mockReset()
    sendMessage.mockReset()
    vi.stubGlobal('chrome', { tabs: { query, sendMessage }, runtime: { id: 'modaicom-test' } })
    query.mockResolvedValue([{ id: 7 }])
  })
  afterEach(() => vi.unstubAllGlobals())

  it('asks the content script and passes through a valid interaction result', async () => {
    sendMessage.mockResolvedValue({ kind: 'success', context: { kind: 'post-comment', post: { authorDisplayName: 'A', originalAuthoredText: 'T' } } })
    await expect(requestPageInteractionContext()).resolves.toMatchObject({ kind: 'success' })
    expect(sendMessage).toHaveBeenCalledWith(7, { version: 2, type: 'REQUEST_PAGE_EXTRACTION' })
  })

  it.each([undefined, null, {}, { kind: 'nope' }, { kind: 'success', context: {} }])(
    'maps malformed runtime result %j to unexpected-error',
    async (runtimeResult) => {
      sendMessage.mockResolvedValue(runtimeResult)
      await expect(requestPageInteractionContext()).resolves.toEqual({ kind: 'unexpected-error' })
    },
  )

  it('returns unexpected-error without logging when the content script is unreachable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    sendMessage.mockRejectedValue(new Error('Could not establish connection'))
    await expect(requestPageInteractionContext()).resolves.toEqual({ kind: 'unexpected-error' })
    expect(consoleError).not.toHaveBeenCalled()
  })
})

describe('isInteractionExtractionResult', () => {
  it('accepts both interaction kinds and every failure kind', () => {
    expect(isInteractionExtractionResult({ kind: 'success', context: { kind: 'post-comment', post: { authorDisplayName: 'A', originalAuthoredText: 'T' } } })).toBe(true)
    expect(isInteractionExtractionResult({ kind: 'success', context: { kind: 'comment-reply', post: { authorDisplayName: 'A', originalAuthoredText: 'T' }, targetComment: { authorDisplayName: 'B', authoredText: 'C' } } })).toBe(true)
    expect(isInteractionExtractionResult({ kind: 'comment-collapsed' })).toBe(true)
    expect(isInteractionExtractionResult({ kind: 'stale-target' })).toBe(true)
  })

  it.each([
    undefined,
    { kind: 'success', context: { kind: 'comment-reply', post: { authorDisplayName: 'A', originalAuthoredText: 'T' } } },
    { kind: 'success', context: { kind: 'post-comment', post: {} } },
    { kind: 'not-a-kind' },
  ])('rejects %j', (value) => {
    expect(isInteractionExtractionResult(value)).toBe(false)
  })
})
