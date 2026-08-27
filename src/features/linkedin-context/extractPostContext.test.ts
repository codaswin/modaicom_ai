import { describe, expect, it } from 'vitest'

import {
  extractPostContextFromDocument,
  type PostExtractionResult,
} from './extractPostContext'

function page(markup: string, url = 'https://www.linkedin.com/posts/example-activity-123') {
  const document = new DOMParser().parseFromString(markup, 'text/html')
  return { document, url }
}

function extract(markup: string, url?: string): PostExtractionResult {
  const target = page(markup, url)
  return extractPostContextFromDocument(target.document, target.url)
}

describe('extractPostContextFromDocument', () => {
  it('extracts required fields and permitted optional metadata', () => {
    expect(
      extract(`
        <article data-urn="urn:li:activity:123">
          <div data-testid="actor-name">Ada Lovelace</div>
          <div data-testid="actor-headline">Founder · Analytical Engines</div>
          <time data-testid="post-time">2h</time>
          <div data-testid="post-body">First paragraph.\\n\\nSecond paragraph.</div>
        </article>
      `),
    ).toEqual({
      kind: 'success',
      context: {
        authorDisplayName: 'Ada Lovelace',
        originalAuthoredText: 'First paragraph.\\n\\nSecond paragraph.',
        authorHeadline: 'Founder · Analytical Engines',
        publicationTimeLabel: '2h',
        stablePostIdentifier: 'urn:li:activity:123',
      },
    })
  })

  it('succeeds when optional metadata is absent', () => {
    expect(
      extract(`
        <article data-urn="urn:li:activity:123">
          <div data-testid="actor-name">Ada Lovelace</div>
          <div data-testid="post-body">A useful post.</div>
        </article>
      `),
    ).toEqual({
      kind: 'success',
      context: {
        authorDisplayName: 'Ada Lovelace',
        originalAuthoredText: 'A useful post.',
        stablePostIdentifier: 'urn:li:activity:123',
      },
    })
  })

  it.each([
    'https://www.linkedin.com/feed/',
    'https://www.linkedin.com/in/ada',
    'https://www.linkedin.com/posts/example-activity-123/comments/',
    'https://learning.linkedin.com/posts/example',
  ])('fails closed for unsupported route %s', (url) => {
    expect(
      extract(
        '<article data-urn="urn:li:activity:123"><div data-testid="actor-name">Ada</div><div data-testid="post-body">Text</div></article>',
        url,
      ),
    ).toEqual({ kind: 'unsupported-surface' })
  })

  it('supports the feed update activity route', () => {
    expect(
      extract(
        '<article data-urn="urn:li:activity:123"><div data-testid="actor-name">Ada</div><div data-testid="post-body">Text</div></article>',
        'https://www.linkedin.com/feed/update/urn:li:activity:123/',
      ).kind,
    ).toBe('success')
  })

  it('rejects zero and multiple post candidates', () => {
    expect(extract('<main />').kind).toBe('post-not-found')
    expect(
      extract(`
        <article data-urn="urn:li:activity:1"><div data-testid="actor-name">Ada</div><div data-testid="post-body">One</div></article>
        <article data-urn="urn:li:activity:2"><div data-testid="actor-name">Grace</div><div data-testid="post-body">Two</div></article>
      `).kind,
    ).toBe('ambiguous-post')
  })

  it('returns collapsed-post when see more is present', () => {
    expect(
      extract(`
        <article data-urn="urn:li:activity:123">
          <div data-testid="actor-name">Ada</div>
          <div data-testid="post-body">Visible fragment</div>
          <button>See more</button>
        </article>
      `),
    ).toEqual({ kind: 'collapsed-post' })
  })

  it('distinguishes no-text and missing-author failures', () => {
    expect(
      extract('<article data-urn="urn:li:activity:123"><div data-testid="actor-name">Ada</div></article>'),
    ).toEqual({ kind: 'no-text' })
    expect(
      extract('<article data-urn="urn:li:activity:123"><div data-testid="post-body">Text</div></article>'),
    ).toEqual({ kind: 'author-not-found' })
  })

  it('ignores embedded shared-post bodies when the primary post has no authored text', () => {
    expect(
      extract(`
        <article data-urn="urn:li:activity:123">
          <div data-testid="actor-name">Ada</div>
          <article data-urn="urn:li:activity:999">
            <div data-testid="actor-name">Grace</div>
            <div data-testid="post-body">Shared post text</div>
          </article>
        </article>
      `),
    ).toEqual({ kind: 'no-text' })
  })

  it('returns an unexpected-error for malformed page URLs', () => {
    expect(
      extract('<article data-urn="urn:li:activity:123" />', 'not a URL'),
    ).toEqual({ kind: 'unexpected-error' })
  })

  it('never includes the URL in context', () => {
    const result = extract(
      '<article data-urn="urn:li:activity:123"><div data-testid="actor-name">Ada</div><div data-testid="post-body">Text</div></article>',
    )
    expect(JSON.stringify(result)).not.toContain('linkedin.com')
  })
})

