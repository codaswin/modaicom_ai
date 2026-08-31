import { describe, expect, it } from 'vitest'

import {
  extractPostContextFromDocument,
  extractPostContextFromElementInPage,
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
  it('extracts the current div-based activity root used by inline targeting', () => {
    const target = page(`
      <div class="feed-shared-update-v2" data-urn="urn:li:activity:456">
        <div class="feed-shared-update-v2__description">Current post text.</div>
        <div data-testid="actor-name">Ada Lovelace</div>
      </div>
    `, 'https://www.linkedin.com/feed/update/urn:li:activity:456/')
    const post = target.document.querySelector('.feed-shared-update-v2')
    expect(post).not.toBeNull()
    expect(extractPostContextFromElementInPage(post as Element, target.url)).toEqual({
      kind: 'success',
      context: {
        authorDisplayName: 'Ada Lovelace',
        originalAuthoredText: 'Current post text.',
        stablePostIdentifier: 'urn:li:activity:456',
      },
    })
  })


  it('extracts a server-driven-UI home feed post from its list item', () => {
    const target = page(
      `
      <main>
        <div data-testid="mainFeed" role="list">
          <div componentkey="expanded-xyz_MAIN_FEED">
            <div role="listitem">
              <img alt="View Ada Lovelace’s profile" />
              <div data-testid="expandable-text-box">Feed post body.<button data-testid="expandable-text-button">… more</button></div>
            </div>
          </div>
        </div>
      </main>
    `,
      'https://www.linkedin.com/feed/',
    )
    const post = target.document.querySelector('[role="listitem"]') as Element
    expect(extractPostContextFromElementInPage(post, target.url)).toEqual({ kind: 'collapsed-post' })

    post.querySelector('[data-testid="expandable-text-button"]')!.remove()
    expect(extractPostContextFromElementInPage(post, target.url)).toEqual({
      kind: 'success',
      context: {
        authorDisplayName: 'Ada Lovelace',
        originalAuthoredText: 'Feed post body.',
      },
    })
  })

  it('degrades to author-not-found on an SDUI post whose author cannot be read', () => {
    const target = page(
      `
      <main>
        <div data-testid="mainFeed" role="list">
          <div componentkey="k">
            <div role="listitem">
              <img alt="decorative background" />
              <div data-testid="expandable-text-box">A post with an unreadable author.</div>
            </div>
          </div>
        </div>
      </main>
    `,
      'https://www.linkedin.com/feed/',
    )
    const post = target.document.querySelector('[role="listitem"]') as Element
    expect(extractPostContextFromElementInPage(post, target.url)).toEqual({ kind: 'author-not-found' })
  })

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
          <div data-testid="post-body">
            Visible fragment
            <button>See more</button>
          </div>
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

  it('only detects see more inside the Primary Post body', () => {
    expect(
      extract(`
        <article data-urn="urn:li:activity:123">
          <div data-testid="actor-name">Ada</div>
          <div data-testid="post-body">Complete authored text.</div>
          <article data-urn="urn:li:activity:999">
            <button>See more</button>
            <div data-testid="post-body">Shared text</div>
          </article>
        </article>
      `),
    ).toMatchObject({
      kind: 'success',
      context: { originalAuthoredText: 'Complete authored text.' },
    })
  })

  it('preserves paragraph breaks from block elements', () => {
    expect(
      extract(`
        <article data-urn="urn:li:activity:123">
          <div data-testid="actor-name">Ada</div>
          <div data-testid="post-body"><p>First paragraph.</p><p>Second paragraph.</p></div>
        </article>
      `),
    ).toMatchObject({
      kind: 'success',
      context: { originalAuthoredText: 'First paragraph.\nSecond paragraph.' },
    })
  })

  it('normalizes the By prefix from an ARIA author fallback', () => {
    expect(
      extract(`
        <article data-urn="urn:li:activity:123">
          <div aria-label="By Ada Lovelace"></div>
          <div data-testid="post-body">A useful post.</div>
        </article>
      `),
    ).toMatchObject({
      kind: 'success',
      context: { authorDisplayName: 'Ada Lovelace' },
    })
  })

  it('extracts the current update-components author and body structure', () => {
    expect(extract(`
      <article class="feed-shared-update-v2" data-urn="urn:li:activity:current">
        <span class="update-components-actor__name">Ada Lovelace</span>
        <div class="update-components-text"><span>Current feed text.</span></div>
      </article>`)).toMatchObject({ kind: 'success', context: { authorDisplayName: 'Ada Lovelace', originalAuthoredText: 'Current feed text.' } })
  })

  it('extracts the current actor__title markup with duplicated name and connection chrome', () => {
    // The activity-permalink markup LinkedIn now ships: a div[data-urn] root,
    // the name in .update-components-actor__title as visible + screen-reader
    // copies plus "• 1st" / "Verified", and description / sub-description for
    // headline and time.
    const target = page(
      `
      <div class="feed-shared-update-v2" role="article" data-urn="urn:li:activity:7499661622991515648">
        <div class="update-components-actor__container">
          <a class="update-components-actor__meta-link" href="https://www.linkedin.com/in/vishnuhari-h">
            <span class="update-components-actor__title">
              <span class="hoverable-link-text">
                <span aria-hidden="true">Vishnuhari Harikumar</span>
                <span class="visually-hidden">Vishnuhari Harikumar</span>
              </span>
              <span class="text-body-xsmall"><span aria-hidden="true">• 1st</span><span class="visually-hidden">Verified • 1st</span></span>
            </span>
            <span class="update-components-actor__description">On a Mission to create 1M Digital Entrepreneurs with AIOn a Mission to create 1M Digital Entrepreneurs with AI</span>
            <span class="update-components-actor__sub-description"><span aria-hidden="true"><time>1d</time> • </span><span class="visually-hidden">1 day ago • Visible to anyone</span></span>
          </a>
        </div>
        <div class="update-components-text"><span>I used to think marketing was everything.</span></div>
      </div>`,
      'https://www.linkedin.com/feed/update/urn:li:activity:7499661622991515648/',
    )
    const post = target.document.querySelector('.feed-shared-update-v2') as Element
    expect(extractPostContextFromElementInPage(post, target.url)).toMatchObject({
      kind: 'success',
      context: {
        authorDisplayName: 'Vishnuhari Harikumar',
        originalAuthoredText: 'I used to think marketing was everything.',
        authorHeadline: 'On a Mission to create 1M Digital Entrepreneurs with AI',
        publicationTimeLabel: '1d',
        stablePostIdentifier: 'urn:li:activity:7499661622991515648',
      },
    })
  })

  it('never includes the URL in context', () => {
    const result = extract(
      '<article data-urn="urn:li:activity:123"><div data-testid="actor-name">Ada</div><div data-testid="post-body">Text</div></article>',
    )
    expect(JSON.stringify(result)).not.toContain('linkedin.com')
  })

  it.each([
    ['a legitimately reduplicated name is not halved', 'Yang Yang', 'Yang Yang'],
    ['a brand with an ordinal-like token is kept intact', 'Studio 21st Century', 'Studio 21st Century'],
    ['a company name with a pipe is kept intact', 'Nike | Just Do It', 'Nike | Just Do It'],
    ['the doubled clean name from the title collapses', 'Ada LovelaceAda Lovelace', 'Ada Lovelace'],
    ['the connection-degree chrome is stripped', 'Ada Lovelace • 1st', 'Ada Lovelace'],
    ['a trailing bare degree is stripped', 'Ada Lovelace 2nd', 'Ada Lovelace'],
  ])('cleanActorName: %s', (_label, rendered, expected) => {
    const result = extract(
      `<article data-urn="urn:li:activity:1"><span class="update-components-actor__title">${rendered}</span><div data-testid="post-body">Body text.</div></article>`,
    )
    expect(result).toMatchObject({ kind: 'success', context: { authorDisplayName: expected } })
  })
})

