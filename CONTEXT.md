# modaicom

modaicom is a user-controlled assistant for drafting responses to LinkedIn content. It reduces the effort of composing a response while leaving publication entirely to the user.

## Language

**Supported LinkedIn Page**:
An HTTPS page whose hostname is exactly `linkedin.com` or `www.linkedin.com`, regardless of path.
_Avoid_: LinkedIn site, LinkedIn domain

**Individual LinkedIn Post Page**:
A Supported LinkedIn Page that presents one LinkedIn post as the page's primary subject.
_Avoid_: LinkedIn feed, multi-post page

**Primary Post**:
The single post presented as the main subject of an Individual LinkedIn Post Page.
_Avoid_: First post, visible post

**Extracted Post Context**:
A structured representation of a Primary Post containing its author's display name and post text, with an optional author headline, stable post identifier, and visible publication/time label. It excludes LinkedIn URLs unless a future feature establishes a concrete need for them.
_Avoid_: Page scrape, current tab data, post URL

**No-Text Failure**:
The extraction outcome when a Primary Post has no Original Authored Text.
_Avoid_: Partial context, shared-post text

**Author-Not-Found Failure**:
The required-data extraction outcome when a Primary Post has no author display name.
_Avoid_: Anonymous success, inferred author

**Collapsed Post**:
A Primary Post whose complete authored text is not currently available to modaicom because LinkedIn has collapsed it behind a manual expansion control such as “see more.”
_Avoid_: Short post, truncated-by-modaicom post

**Original Authored Text**:
Text written by the Primary Post author, excluding the body of an embedded or shared post.
_Avoid_: Quoted post, reshared content

**Feed-Post Targeting**:
The capability through which a user explicitly identifies one specific post on the LinkedIn home feed or an individual LinkedIn post page for read-only context extraction.
_Avoid_: First-post extraction, automatic feed selection

**Top-Level Feed Post**:
A post candidate that belongs directly to the home feed's post collection, excluding nested shared posts, comments, replies, embedded content, and unrelated cards.
_Avoid_: Visible card, first feed item, nested post

**Feed Selection Session**:
Legacy interaction in which modaicom presented per-post Selection Controls for currently loaded Top-Level Feed Posts. It is not part of the active Inline Trigger UX.
_Avoid_: Passive feed scanning, automatic selection

**Selection Control**:
A temporary per-post “Use this post” action attached to one Top-Level Feed Post during the legacy Feed Selection Session. It is distinct from the Inline Trigger.
_Avoid_: Feed button, global select action

**Inline Trigger**:
A branded, accessible `modaicom` button placed beside an eligible comment composer and explicitly used by the user to target that composer’s owning Top-Level Feed Post or Primary Post for read-only extraction.
_Avoid_: Selection Control, automatic trigger, editor insertion control

**Inline Targeting Session**:
The ephemeral interaction beginning when the user clicks an Inline Trigger and ending after the selected Owning Post's extraction result reaches its terminal handoff or is cleared.
_Avoid_: Persistent selection, background targeting

**Session Relay Result**:
The latest typed extraction outcome temporarily handed from an Inline Targeting Session to the popup for read-only display.
_Avoid_: Persistent context, global latest result

**Eligible Comment Composer**:
A genuine LinkedIn comment editor owned by a validated target post, excluding replies, messages, search fields, post composers, nested/shared posts, and unrelated editable UI.
_Avoid_: Any textarea, reply editor, post composer

**Owning Post**:
The validated Top-Level Feed Post or Primary Post that directly contains an Eligible Comment Composer and is targeted when its Inline Trigger is clicked.
_Avoid_: Nearest card, focused post, inferred ancestor

**Ephemeral Selection Token**:
A temporary marker attached to the exact Owning Post Element selected during an Inline Targeting Session so modaicom can verify that same target before extraction. It has no persistence beyond the active session.
_Avoid_: Stored post reference, durable selector

**Selection Banner**:
Legacy temporary page-level affordance from the Feed Selection Session UX; it is not part of the active Inline Trigger flow.
_Avoid_: Persistent LinkedIn UI, popup-only cancellation

**Feed Candidate Discovery**:
The conservative, adapter-owned process of finding exactly the currently loaded Top-Level Feed Posts on the supported `/feed/` surface while excluding nested or unrelated content.
_Avoid_: Article scraping, broad card matching

**Ambiguous Candidates**:
A typed selection outcome when Feed Candidate Discovery cannot establish a reliable set of distinct Top-Level Feed Posts.
_Avoid_: Best-guess candidate, first-match selection

**Selection Failure**:
A typed outcome when Feed Candidate Discovery or page injection cannot start or complete a Feed Selection Session.
_Avoid_: Extraction failure, silent fallback

**Selected Feed Post**:
The one Top-Level Feed Post explicitly chosen by the user during a Feed Selection Session and subsequently treated as the Primary Post for context extraction.
_Avoid_: Focused post, inferred target

**Selection Snapshot**:
Legacy fixed candidate set from the Feed Selection Session UX; it is not used by the active Inline Trigger flow.
_Avoid_: Live feed tracking, mutation-observer targeting

**Feed Targeting Outcome**:
A typed result from the feed-targeting flow, covering successful selection, cancellation, candidate-discovery or injection failure, ambiguity, and stale-target detection.
_Avoid_: Nullable target, generic failure string

**Stale Target**:
The typed outcome when the Top-Level Feed Post selected by the user is removed or no longer matches its original DOM target before extraction completes.
_Avoid_: Substitute post, nearest-post fallback

**Targeted Comment/Reply Extraction**:
The future capability to extract one user-identified LinkedIn comment or reply with its relevant surrounding context. It is intentionally outside the smallest Phase 2 slice.
_Avoid_: All-comments extraction, arbitrary comment selection

**Suggestion**:
A candidate response generated by modaicom for the user to review and select. A Suggestion is never published automatically.
_Avoid_: Published comment, automatic reply
