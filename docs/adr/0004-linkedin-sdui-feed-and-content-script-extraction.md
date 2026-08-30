# Adapt to LinkedIn's server-driven feed and route popup extraction through the content script

Status: accepted on 2026-08-30.

LinkedIn now serves a server-driven UI ("SDUI") frontend for the logged-in home
`/feed/`: obfuscated class names, no `urn:li:activity:` identifier anywhere in the
DOM, posts rendered as `[role="listitem"]` inside `[data-testid="mainFeed"]`, post
body in `[data-testid="expandable-text-box"]`, and a `tiptap` comment composer
that mounts only after the user opens a post's comments. Individual `/posts/...`
pages still use the legacy `article` / `.feed-shared-update-v2` markup.

The composer and post adapters now recognise both regimes. For SDUI feed posts,
which have no activity URN, the per-post deduplication identity is the framework
`componentkey` reconciliation token on the post's list item — session-scoped, never
returned in extracted context, never persisted. A collapsed SDUI post is detected
from its inline `[data-testid="expandable-text-button"]` ("… more") control.

Because the SDUI feed composer is lazy, the inline trigger appears next to the
composer once the user opens a post's comment section, not on the collapsed post.
An always-visible feed trigger is deferred.

This decision also removes the `scripting` permission. The popup's Phase 2
individual-post fallback previously injected the extractor with
`chrome.scripting.executeScript({ func })`, which serialises the function and
loses its module scope, so the adapter helpers it depends on were always
`undefined` in the page and every fallback extraction failed. The popup now sends
a versioned `REQUEST_PAGE_EXTRACTION` message to the persistent content script,
which runs the extractor in the page and returns the typed result. The read-only,
no-persistence, no-transmission, no-logging, and no-automatic-action guarantees of
ADR-0002 and ADR-0003 are unchanged.
