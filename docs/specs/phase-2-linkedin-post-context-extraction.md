# Phase 2 — LinkedIn Post Context Extraction

Status: Confirmed on 2026-08-28.

This specification is the shared understanding reached through the `grill-with-docs` session. It is intentionally limited to reading and structuring the Primary Post on an individual LinkedIn post page.

## Problem Statement

modaicom currently detects whether the active tab is a Supported LinkedIn Page, but it cannot yet understand the post that the user is viewing. Without a reliable, read-only Extracted Post Context, later response-assistance features would have no trustworthy input. LinkedIn pages may contain multiple posts, collapsed text, shared posts, dynamic content, and unstable DOM details, so silently selecting or returning incomplete content would produce misleading context.

## Solution

When the user opens modaicom on a supported individual-post route, the popup performs one fresh, on-demand extraction through a dedicated LinkedIn adapter. The adapter must identify exactly one unambiguous Primary Post, read its required author display name and Original Authored Text, collect permitted optional metadata when reliably available, normalize the text, and return a plain serializable Extracted Post Context or a typed failure.

The popup shows a read-only, bounded preview on success. It gives actionable guidance for known failures. If LinkedIn has collapsed the post, modaicom never clicks “see more”; it tells the user to expand it manually and then Retry, which performs a fresh extraction.

## User Stories

1. As a LinkedIn user, I want modaicom to inspect the individual post I am viewing, so that future assistance can use the correct post context.
2. As a LinkedIn user, I want extraction to run only when I open modaicom, so that the extension does not continuously observe my browsing.
3. As a LinkedIn user, I want modaicom to support recognized individual-post routes, so that feed and other multi-post pages are not misinterpreted.
4. As a LinkedIn user, I want modaicom to reject unsupported LinkedIn paths, so that it does not guess which post I mean.
5. As a LinkedIn user, I want extraction to require exactly one unambiguous Primary Post candidate, so that a nearby or first-visible post is never substituted silently.
6. As a LinkedIn user, I want the author display name included, so that later assistance knows whose post it is.
7. As a LinkedIn user, I want the Original Authored Text included, so that later assistance receives the post’s actual authored content.
8. As a LinkedIn user, I want optional author headline information included when available, so that useful context is preserved without making it mandatory.
9. As a LinkedIn user, I want a stable post identifier included only when reliably available, so that identity is useful without fabricated values.
10. As a LinkedIn user, I want the visible publication/time label preserved when available, so that temporal context is not discarded or incorrectly reinterpreted.
11. As a LinkedIn user, I want URLs excluded from extracted context, so that page addresses are not carried into future processing without a concrete requirement.
12. As a LinkedIn user, I want missing optional metadata not to block extraction, so that a valid post remains usable when LinkedIn omits secondary fields.
13. As a LinkedIn user, I want missing Original Authored Text to produce a no-text failure, so that partial context is never presented as complete.
14. As a LinkedIn user, I want a missing author display name to produce an author-not-found required-data failure, so that modaicom never guesses an author.
15. As a LinkedIn user, I want collapsed text identified explicitly, so that I understand why extraction cannot yet complete.
16. As a LinkedIn user, I want clear instructions to expand “see more” manually, so that modaicom remains read-only while I can recover from collapsed content.
17. As a LinkedIn user, I want Retry to perform a fresh extraction after I expand the post, so that I do not need to close and reopen the popup.
18. As a LinkedIn user, I want media, documents, polls, and link cards ignored except for the post’s own written body, so that Phase 2 stays focused on authored text.
19. As a LinkedIn user, I want shared or embedded post bodies excluded, so that another author’s content is not mistaken for the Primary Post’s text.
20. As a LinkedIn user, I want media-only or shared-only posts to produce no-text rather than a misleading success, so that context quality is explicit.
21. As a LinkedIn user, I want authored text normalized for incidental DOM whitespace while preserving meaningful paragraph breaks, so that the preview is readable.
22. As a LinkedIn user, I want extraction to work regardless of post language or LinkedIn UI language, so that content is preserved rather than translated.
23. As a LinkedIn user, I want extracted data represented as plain strings and metadata, so that page markup, scripts, and event handlers cannot cross into extension state.
24. As a LinkedIn user, I want success shown as a bounded, scrollable preview, so that I can verify what modaicom read.
25. As a LinkedIn user, I want known failures to explain the next action, so that I can recover without seeing technical selector or exception details.
26. As a LinkedIn user, I want extraction to remain in popup memory only, so that post content is not persisted, transmitted, logged, or sent to an external service.
27. As a maintainer, I want LinkedIn DOM assumptions isolated in one adapter, so that future LinkedIn layout changes do not spread through the popup.
28. As a maintainer, I want deterministic sanitized DOM fixtures, so that extraction behavior can be tested without live user content or brittle live-site tests.
29. As a maintainer, I want feed-post targeting deferred explicitly, so that selecting among multiple feed posts is designed as a separate capability.
30. As a maintainer, I want targeted comment/reply extraction deferred explicitly, so that comment-thread targeting is not smuggled into this slice.

## Implementation Decisions

- The highest test seam is the popup-facing LinkedIn context extraction service. The popup owns transient loading and presentation; the LinkedIn adapter owns route recognition, candidate selection, field extraction, normalization, and typed outcomes.
- Extraction is invoked on demand after the user opens the popup and again only when the user presses Retry.
- Runtime inspection uses `chrome.scripting.executeScript` with temporary `activeTab` access. No persistent LinkedIn host permissions, static content script, or continuously running observer is introduced.
- Only HTTPS individual-post route families such as `/posts/...` and `/feed/update/urn:li:activity:...` are eligible. All other LinkedIn paths fail closed. Eligibility still requires exactly one unambiguous Primary Post candidate in the DOM.
- A successful Extracted Post Context contains required author display name and Original Authored Text. It may contain optional author headline, stable post identifier, and visible publication/time label. Missing optional metadata never fails extraction.
- The extracted context never contains the current or canonical LinkedIn URL. A recognized URL may be used transiently for route recognition or reliable identifier derivation, but the URL is not returned, displayed, stored, logged, transmitted, or sent to another service.
- A stable identifier may come from a recognized URL identifier or an explicit stable DOM identifier. No identifier is fabricated from mutable text.
- The adapter reads the dedicated authored-body region, trims surrounding whitespace, normalizes incidental inline spacing, preserves meaningful paragraph breaks, and removes UI labels. It never clicks “see more.”
- If complete authored text is not available because the post is collapsed, the result is a collapsed-post failure. The popup says: `This post is collapsed. Expand “see more” on LinkedIn, then Retry.` Retry starts a fresh extraction.
- A missing Original Authored Text returns `no-text`. A missing author display name returns `author-not-found` as a required-data failure. Neither returns a partially successful context.
- Attachment and link-card contents are ignored. A post with authored text can succeed regardless of attachments; a media-only post returns `no-text`.
- Embedded or shared post bodies are ignored. If the Primary Post has no Original Authored Text of its own, the result is `no-text`.
- Known outcomes are represented distinctly: success, unsupported surface, post not found, ambiguous post, collapsed post, no-text, author not found, and unexpected extraction failure.
- Retry is offered for collapsed, no-text, not-found, ambiguous, and unexpected extraction failures. Unsupported surfaces retain guidance to open an individual post.
- The popup renders a bounded, scrollable success preview containing the author display name, full normalized post text, and optional metadata actually found. It renders actionable fixed copy for failures and never exposes raw HTML or exceptions.
- Authored text is language-agnostic. Selectors prefer stable semantic or data attributes, with narrowly scoped structural/accessibility fallbacks centralized in the adapter; obfuscated CSS class names and document-wide text searches are not primary selectors.
- Extracted values cross the page-extension boundary as plain serializable data only. No HTML, DOM nodes, scripts, handlers, storage, telemetry, network calls, or LLM/provider behavior is part of this phase.

## Testing Decisions

- Tests verify external behavior at the popup-facing extraction seam and the adapter’s pure DOM contract, not selector implementation details.
- Sanitized fixtures cover recognized `/posts/...` and `/feed/update/urn:li:activity:...` routes; unsupported LinkedIn paths; zero candidates; multiple candidates; successful required fields; each optional field absent; collapsed text; no authored text; media-only posts; shared-only posts; malformed required fields; and unexpected adapter failures.
- Tests verify whitespace normalization, paragraph preservation, removal of UI labels, language-independent authored text, URL exclusion, stable-identifier rules, and exclusion of embedded post bodies.
- Popup tests verify loading, success preview, every typed failure’s actionable copy, Retry’s fresh-extraction behavior, bounded preview rendering, and no crash on rejected or malformed runtime results.
- Chrome runtime calls are mocked at the extension boundary. No live LinkedIn content or user URLs are committed to fixtures.
- Manual Chrome smoke tests verify loading the production build, opening the popup on supported individual-post routes, successful preview, unsupported-path rejection, collapsed-post guidance followed by manual expansion and Retry, no-text and author-not-found behavior, and absence of automatic page mutation.

## Out of Scope

- LinkedIn feed-post targeting or selection among multiple feed posts.
- Targeted comment or reply extraction, comment-thread context, or reply targeting.
- Continuous content scripts, persistent DOM observers, or background extraction.
- AI, LLM providers, prompt construction, tone, intent, length, generation, ranking, regeneration, or suggestion selection.
- Editor insertion, draft replacement, automatic submission, or publishing.
- OCR, media understanding, document parsing, poll interpretation, link fetching, or translation.
- URL persistence or URL-bearing context contracts.
- Storage, telemetry, analytics, network transmission, authentication, and external services.
- Chrome Web Store packaging and automated browser end-to-end infrastructure.

## Further Notes

- Feed-post targeting and targeted comment/reply extraction are required future modaicom capabilities, but are intentionally deferred until this smallest Phase 2 slice proves reliable Primary Post extraction.
- The permanent user-publication constraint remains governed by ADR-0001. The on-demand, read-only permission and privacy boundary is governed by ADR-0002.
- The implementation must preserve the existing Phase 0/1 exact Supported LinkedIn Page definition and existing popup detection behavior outside the new individual-post extraction flow.
