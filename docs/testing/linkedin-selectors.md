# LinkedIn selector reference & re-verification

LinkedIn ships more than one frontend and rewrites its markup without notice, so
the adapter selectors are expected maintenance. This file is the source of truth
for **what** modaicom looks for and **how to check it still matches**.

Record only dates, regime, counts, and pass/fail in the log. Never record
LinkedIn URLs, post/comment content, screenshots, or account data.

## Route families

| Route | Example | Classified as | Expected Markup Regime |
|---|---|---|---|
| Home feed | `/feed/` | `feed` | `sdui` (currently) |
| Individual post | `/posts/<slug>/` | `individual` | `legacy` |
| Activity permalink | `/feed/update/urn:li:activity:<id>/` | `individual` | `legacy` *(assumed — verify)* |

## Selectors by Markup Regime

### `legacy` (individual `/posts/…`, activity permalinks)

| Purpose | Selector |
|---|---|
| Feed container | `main [role="feed"]`, `main .scaffold-finite-scroll__content` |
| Post root | `article` / `.feed-shared-update-v2` with `data-urn`/`data-id` starting `urn:li:activity:` |
| Post body | `[data-testid="post-body"]`, `.feed-shared-update-v2__description`, `.feed-shared-inline-show-more-text`, `.update-components-text` |
| Author | `[data-testid="actor-name"]`, `.update-components-actor__name`, `.update-components-actor__title span[aria-hidden="true"]` (current — name is printed twice, visible + screen-reader, then " • 1st" / "Verified"; the extractor collapses the repeat and strips the chrome), `.update-components-actor__title`, `[aria-label^="By "]` |
| Author headline | `[data-testid="actor-headline"]`, `.update-components-actor__description` |
| Post time | `time`, `.update-components-actor__sub-description` (mashes "1d • 1 day ago • Visible to anyone…"; extractor keeps the leading token) |
| Comment composer | editor inside `.comments-comment-box` / `.comments-comment-texteditor` / `[data-testid="comment-composer"]`; labelled `aria-label*="comment"` or `aria-placeholder*="comment"` |
| Collapsed | a control inside the body whose text matches `see more` |
| Stable identity | `data-urn` / `data-id` (`urn:li:activity:…`) |

### `sdui` (home `/feed/`)

| Purpose | Selector |
|---|---|
| Feed container | `main [data-testid="mainFeed"]` (`role="list"`) |
| Post root | `[role="listitem"]` inside `mainFeed` that contains a post body and is not nested in another list item |
| Post body | `[data-testid="expandable-text-box"]` |
| Author | `img[alt]` matching `View <name>'s profile` (first in the post); fallback: first `a[href*="/in/"]`/`a[href*="/company/"]` with text, trailing ` • 2nd` stripped |
| Comment composer | first `[contenteditable="true"][role="textbox"][aria-label*="comment" i]` (`.tiptap`) within the post; later ones are reply composers |
| Collapsed | presence of `[data-testid="expandable-text-button"]` inside the body (LinkedIn removes it on expand) |
| Stable identity | `componentkey` on the list-item wrapper (session-scoped, opaque, never extracted) |

## Verification snippet

On `https://www.linkedin.com/feed/`, open a post's comment box, then paste into
DevTools console. It replicates the adapter's candidate discovery and composer
eligibility and prints counts only.

```js
(() => {
  const SDUI_C = 'main [data-testid="mainFeed"]';
  const LEG_C = 'main [role="feed"], main .scaffold-finite-scroll__content';
  const regime = document.querySelector(SDUI_C) ? 'sdui'
    : document.querySelector(LEG_C) ? 'legacy' : 'unknown';
  const BODY = '[data-testid="post-body"],[data-testid="expandable-text-box"],.feed-shared-update-v2__description,.feed-shared-inline-show-more-text,.update-components-text';
  const scope = document.querySelector(SDUI_C) || document.querySelector(LEG_C);
  const listRoots = scope ? [...scope.querySelectorAll('[role="listitem"], article[data-urn], .feed-shared-update-v2[data-urn]')] : [];
  const posts = listRoots.filter(el =>
    el.querySelector(BODY) &&
    !el.parentElement?.closest('[role="listitem"]') &&
    (el.matches('article[data-urn],[data-urn]') || el.closest(SDUI_C)));
  const ids = new Set(posts.map(p =>
    p.getAttribute('data-urn') || p.getAttribute('componentkey') || p.parentElement?.getAttribute('componentkey')));
  const composers = [...document.querySelectorAll('[contenteditable="true"][aria-label*="comment" i], [contenteditable="true"][aria-placeholder*="comment" i]')]
    .filter(e => !e.closest('[class*="reply" i],[data-view-name*="reply" i]'));
  const firstPerPost = composers.filter(e => {
    const post = e.closest('[role="listitem"], article[data-urn], .feed-shared-update-v2');
    return post && post.querySelector('[contenteditable="true"][aria-label*="comment" i], [contenteditable="true"][aria-placeholder*="comment" i]') === e;
  });
  console.log({ regime, posts: posts.length, uniqueIdentities: ids.size, composers: composers.length, eligibleComposers: firstPerPost.length });
})();
```

Healthy result: `regime` is `sdui` or `legacy` (not `unknown`); `posts` ≈ visible
post count; `uniqueIdentities` equals `posts`; after opening one comment box,
`eligibleComposers` is `1`.

## Phase 4 — Comment / Reply (Comment Adapter, `legacy` only)

| Purpose | Selector | Verified |
|---|---|---|
| Comment root | `article.comments-comment-entity[data-id*="urn:li:comment:"]` (also `.comments-comment-item`) | 2026-08-30 |
| Comment stable identity | `data-id` (`urn:li:comment:(...)`) | 2026-08-30 |
| Comment → Owning Post | `comment.closest('.feed-shared-update-v2[data-urn^="urn:li:activity:"], article[data-urn^="urn:li:activity:"]')` (not `POST_ROOT_SELECTOR` — a comment `<article>` matches `article[data-id]`) | 2026-08-30 |
| Comment Author | `.comments-comment-meta__description-title` | 2026-08-30 |
| Comment Body | `.comments-comment-item__main-content` / `.comments-comment-entity__content` / `.update-components-text` (scoped to the comment, not a nested reply) | 2026-08-30 |
| Comment collapse control | `.comments-comment-item__inline-show-more-text` or a body control matching `see more` / `…more` | **unverified** — no long comment sampled |
| Reply composer (`legacy`) | `[contenteditable="true"][aria-placeholder*="reply" i]` inside a validated Comment root | 2026-08-30 |
| Reply → Target Comment | `replyComposer.closest(commentRoot)` — always the thread's **top-level** comment (LinkedIn uses one shared thread composer; nested replies not individually targetable) | 2026-08-30 |
| SDUI comment marker (for reply suppression) | `[id*="urn:li:comment:"]`, `[componentkey*="urn:li:comment:"]` — a comment URN before a comment editor ⇒ reply composer ⇒ no trigger | 2026-08-30 |

`comment-reply` is offered on `legacy` only. On `sdui` the reply editor is
identical to the comment editor and has no structural link to its target
comment, so it gets no trigger (ADR-0006).

## Fixture redaction rule

Unit-test fixtures are hand-built synthetic DOM, never captured LinkedIn HTML.
A fixture contains only: structural markers (tags, classes, `data-*`, `role`,
`aria-*`), **placeholder** author names and text, and **placeholder** URNs
(`urn:li:activity:N`, `urn:li:comment:(activity:N,N)`). Never a real LinkedIn
name, comment/post text, URN, or tracking parameter. Observer / reconciliation
scenarios use the real debounced scheduler, not fake timers.

## Verification log

| Date | Route family | Regime | posts / identities / eligible composers | Result | Notes |
|---|---|---|---|---|---|
| 2026-08-30 | `/feed/` | sdui | 7 / 7 / 1 | Pass | Initial SDUI support; collapsed control confirmed removed on expand |
| 2026-08-30 | `/feed/update/urn:li:activity:…` | legacy | 9 comments | Pass | Comment root, author, body, reply composer (`aria-placeholder="Add a reply…"`), reply→top-level-comment nesting all confirmed |
| | `/posts/…` | legacy | | Pending | assumed identical to `/feed/update/…` |
| | (any) | — | | Pending | long collapsed comment — expander selector unverified |
