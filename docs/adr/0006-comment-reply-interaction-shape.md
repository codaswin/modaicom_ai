# Phase 4 comment-reply: one Interaction Target, legacy-regime-only, thread-root target

Status: accepted on 2026-08-30 (grill-with-docs). Extends ADR-0003 and ADR-0005.

Phase 4 adds a `modaicom` trigger beside LinkedIn reply composers that extracts
one Target Comment together with its Owning Post context. The decisions below
were reached by grilling and are recorded here because each is hard to reverse
once implementations build on it, and each would surprise a reader who assumed
otherwise.

## One Inline Trigger, parameterised by an Interaction Target

`post-comment` and `comment-reply` are **not** separate trigger systems. There is
one reconcile lifecycle, one MutationObserver, one dedup map, one relay, one
teardown — parameterised by an `Interaction Target` (`kind` + Owning Post +
optional Target Comment). Composer recognition becomes a classifier:
`post-comment` composer, `comment-reply` composer, or neither. This keeps
Phase 3's Owning Post validation, `Ephemeral Selection Token`, generation
barrier, and SPA cleanup as literally the same code for both kinds, so the
constraint "existing Phase 3 Owning Post guarantees must not be weakened" is
structurally enforced rather than promised.

The relay carries a discriminated `LinkedInInteractionContext`; the result type
becomes `InteractionExtractionResult`; `RELAY_VERSION` bumps to `2` (the payload
shape changes and the relay is only a 5-minute session cache, so a version bump
is a clean cutover). Dedup key is `${kind}:${targetIdentity}` — post identity for
`post-comment`, the Target Comment's `urn:li:comment:` URN for `comment-reply`.

## Comment-reply is `legacy`-Markup-Regime-only; fail closed elsewhere

Live DOM verification: on `legacy` surfaces (`/posts/...`,
`/feed/update/urn:li:activity:...`) a comment is
`article.comments-comment-entity[data-id*="urn:li:comment:"]`, the reply composer
is `[aria-placeholder="Add a reply…"]` nested inside that comment, and the
comment sits inside the activity-URN post root — both ownership links are
structurally provable. On the `sdui` home feed the reply editor is
byte-identical to the top comment editor (`aria-label="Text editor for creating
comment"`, `.tiptap`) and has **no** structural pointer to its target comment —
only DOM order and a plain-text author header. Proving `reply composer → Target
Comment` there would be exactly the "guess the nearest" the constraints forbid.

Therefore `comment-reply` is offered only on `legacy`. On `sdui` a reply
composer receives **no** trigger, and the Phase 3 behaviour where a lone reply
composer received a `post-comment` trigger is suppressed: an `sdui` editor is an
eligible `post-comment` composer only if no `urn:li:comment:`-bearing element
precedes it in document order within its post. A `COMMENT_REPLY_REGIME_UNSUPPORTED`
diagnostic records when a reply composer is seen on an unsupported regime, so we
learn when LinkedIn changes SDUI to make it feasible. Same fail-closed posture as
ADR-0005's `unknown` regime.

## The Target Comment is always the thread's top-level comment

Verified: LinkedIn renders one **shared thread composer** per top-level comment.
Replying to a nested reply mounts the editor inside the **top-level comment's**
subtree with an `@mention` prefill (editor content — never read). So
`replyComposer.closest(commentRoot)` always resolves to the thread root, never a
nested reply. The Target Comment is that thread root; nested replies are not
individually targetable in Phase 4. This is a disclosed limitation, not a guess —
the captured context is always structurally correct, just less specific. The
popup says "Replying in [Author]'s thread". A reply composer that resolves to
zero or ≥2 irreconcilable comment roots gets no trigger
(`AMBIGUOUS_TARGET_COMMENT`).

## All-or-nothing

A `comment-reply` succeeds only if both the Owning Post and the Target Comment
extract. A comment-half failure (`comment-not-found`, `comment-author-not-found`,
`comment-no-text`, `comment-collapsed`, `comment-stale-target`) fails the whole
interaction; it never downgrades to a `post-comment` result. The Comment Body is
read from a dedicated authored-text region, never the comment card's raw
`textContent`; `@mention` / `#hashtag` link text is kept. modaicom never clicks
"…more", "Load more replies", or "See N more comments".

ADR-0001's user-controlled-publication and ADR-0002's read-only, no-persistence,
no-transmission, no-logging, no-automatic-action guarantees are unchanged.
