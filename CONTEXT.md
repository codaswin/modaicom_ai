# modaicom

modaicom is a user-controlled assistant for drafting responses to LinkedIn content. It reduces the effort of composing a response while leaving publication entirely to the user. From Phase 5, drafting may send the authored text the user explicitly selects to a user-configured AI provider using the user's own API key (BYOK, no shared backend); see ADR-0007 and ADR-0008. From Phase 6 the user has typed Tone, Intent and Response Length controls (ADR-0009); Phase 7 wires them into the prompt so they actually steer the draft (ADR-0010).

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
Text written by the Primary Post author, excluding the body of an embedded or shared post. Preserved as written, in any language, without parsing or translation. Detecting the UI controls *around* it (collapse toggles, author labels) is best-effort and can be language-dependent; when that detection fails, extraction returns a typed failure, never wrong text.
_Avoid_: Quoted post, reshared content

**Feed-Post Targeting**:
The capability through which a user explicitly identifies one specific post on the LinkedIn home feed or an individual LinkedIn post page for read-only context extraction.
_Avoid_: First-post extraction, automatic feed selection

**Markup Regime**:
The structural DOM family a LinkedIn surface renders. `legacy` uses `article` / `.feed-shared-update-v2` roots with a `urn:li:activity:` identifier and an always-present comment composer; `sdui` (server-driven UI) uses obfuscated classes, no activity identifier, `[data-testid="mainFeed"]` list items, and a comment composer that appears only after the user opens a post's comments. modaicom recognises both; an unrecognised feed is treated as `unknown` and receives no Inline Trigger.
_Avoid_: LinkedIn version, feed layout, A/B variant

**Top-Level Feed Post**:
A post candidate that belongs directly to the home feed's post collection, excluding nested shared posts, comments, replies, embedded content, and unrelated cards.
_Avoid_: Visible card, first feed item, nested post

**Inline Trigger**:
A compact, branded, accessible `modaicom` button rendered in an isolated shadow root beside an Eligible Comment Composer or Reply Composer, clicked by the user to target that composer's Interaction Target for read-only extraction. It starts the Inline Targeting Session that a later Draft Insertion completes.
_Avoid_: Selection Control, automatic trigger, "modaicom" text button

**Inline Targeting Session**:
The ephemeral interaction beginning when the user clicks an Inline Trigger and lasting until an SPA route change, a fresh Inline Trigger click, or the five-minute relay expiry. It spans extraction, generation, and any number of Draft Insertions; the content script holds a live reference to the exact editor for the session's whole duration.
_Avoid_: Persistent selection, background targeting

**Interaction Target**:
A validated, click-ready handle resolved from one composer: its kind (`post-comment` or `comment-reply`), its Owning Post, and — for `comment-reply` — its Target Comment. One Inline Trigger serves exactly one Interaction Target.
_Avoid_: Selection, target node, nearest card

**LinkedIn Interaction Context**:
The discriminated read-only payload an Inline Targeting Session produces: a **Post-Comment Interaction** (the Owning Post's Extracted Post Context) or a **Comment-Reply Interaction** (the Owning Post's Extracted Post Context plus one Target Comment's Comment Author and Comment Body).
_Avoid_: Extraction blob, comment payload

**Session Relay Result**:
The latest typed LinkedIn Interaction Context, or typed failure, temporarily handed from an Inline Targeting Session to the popup for read-only display.
_Avoid_: Persistent context, global latest result

**Eligible Comment Composer**:
A genuine LinkedIn top-level comment editor owned by a validated Owning Post, excluding Reply Composers, messages, search fields, post composers, nested/shared posts, and unrelated editable UI.
_Avoid_: Any textarea, reply editor, post composer

**Reply Composer**:
A genuine LinkedIn reply editor whose validated Target Comment belongs to exactly one Owning Post. Distinct from an Eligible Comment Composer. Recognised only in the `legacy` Markup Regime; a reply composer in any other regime receives no Inline Trigger.
_Avoid_: Nested comment box, any reply-looking editor

**Owning Post**:
The validated Top-Level Feed Post or Primary Post that contains a Post-Comment Interaction's Eligible Comment Composer, or a Comment-Reply Interaction's Target Comment, and is targeted when its Inline Trigger is clicked.
_Avoid_: Nearest card, focused post, inferred ancestor

**Comment**:
A LinkedIn comment element with a recognised structural comment-root marker for the current Markup Regime and exactly one validated Owning Post ancestor, rejecting nested and shared posts. Carries a `urn:li:comment:` stable identity in supported regimes.
_Avoid_: Comment card, nearest comment, thread

**Target Comment**:
The single Comment a Comment-Reply Interaction extracts: the top-level comment of the thread whose shared reply composer the user targeted. Nested replies within that thread are not individually targetable.
_Avoid_: Replied-to reply, nearest comment, focused comment

**Comment Body**:
The dedicated authored-text region of a Comment. Preserved as written, in any language, without parsing or translation; embedded cards, polls, translation controls and surrounding chrome are excluded, and detecting that chrome is best-effort. When no Comment Body region is recognised, extraction fails typed rather than returning the comment card's raw text.
_Avoid_: Comment card text, comment scrape

**Comment Author**:
The display name from a Comment's actor-name region, normalized with best-effort removal of connection-degree, "Author", "Following", and verification chrome. "LinkedIn Member" (a deactivated account) is a valid Comment Author.
_Avoid_: Commenter handle, inferred author

**Comment Extraction Failure**:
A typed Comment-Reply outcome when the Owning Post extracts but the Target Comment does not — comment not found, comment author not found, comment no-text, comment collapsed, comment stale-target, or ambiguous target comment. A Comment-Reply Interaction is all-or-nothing: a comment-half failure fails the whole interaction rather than downgrading to a Post-Comment result.
_Avoid_: Partial comment context, silent downgrade

**Ephemeral Selection Token**:
A temporary marker attached to the exact element(s) selected during an Inline Targeting Session — the Owning Post, and for a Comment-Reply Interaction also the Target Comment — so modaicom can verify the same target(s) before extraction. It has no persistence beyond the active session.
_Avoid_: Stored post reference, durable selector

**Feed Candidate Discovery**:
The conservative, adapter-owned process of finding exactly the currently loaded Top-Level Feed Posts on the supported `/feed/` surface while excluding nested or unrelated content.
_Avoid_: Article scraping, broad card matching

**Ambiguous Candidates**:
A typed selection outcome when Feed Candidate Discovery cannot establish a reliable set of distinct Top-Level Feed Posts.
_Avoid_: Best-guess candidate, first-match selection

**Selection Failure**:
A typed outcome when Feed Candidate Discovery or page injection cannot start or complete a Feed Selection Session.
_Avoid_: Extraction failure, silent fallback

**Stale Target**:
The typed outcome when the Top-Level Feed Post selected by the user is removed or no longer matches its original DOM target before extraction completes.
_Avoid_: Substitute post, nearest-post fallback

**Targeted Comment/Reply Extraction**:
The Phase 4 capability to extract one user-identified LinkedIn Target Comment together with its Owning Post context, via a Comment-Reply Interaction. Reply-thread bundling and nested-reply targeting remain out of scope.
_Avoid_: All-comments extraction, arbitrary comment selection

**Generation Request**:
The minimised payload derived from a LinkedIn Interaction Context that is permitted to leave the device: `{ interactionKind, postText }` for a Post-Comment Interaction, plus `commentText` for a Comment-Reply Interaction. It contains no author display name, author headline, stable post identifier, publication-time label, URL, DOM, HTML, or editor content. It is produced in the popup; the service worker re-checks it against a strict guard.
_Avoid_: Prompt payload, extraction blob, full context

**Generation Input**:
The provider-neutral `{ system, user }` strings the generation layer builds from a Generation Request and the Preference Instructions — the instructions render into `system` as a mandatory list, the authored text into `user`. The AI Provider layer maps a Generation Input onto its own API shape.
_Avoid_: Prompt, messages array, chat request

**AI Provider**:
The provider-neutral interface `{ id, generate(input, { model, apiKey, signal }) }` returning a discriminated `GenerationResult`. Provider id and model id are opaque strings. No LinkedIn type enters a provider; no provider type (HTTP status, response body, raw exception) leaves one.
_Avoid_: LLM client, OpenAI client, model SDK

**Transmission Consent**:
A recorded `{ providerId, consentedAt }` in `chrome.storage.local` capturing the user's one-time, provider-scoped acknowledgement that selected LinkedIn authored text will be sent to that provider. A hard precondition the service worker checks before any provider request; switching providers requires a fresh consent.
_Avoid_: Terms acceptance, opt-in flag, telemetry consent

**Provider Configuration**:
`{ providerId, model, baseUrl? }` in `chrome.storage.local`. The API key is stored separately under a per-provider key, `chrome.storage.local` only, **never `chrome.storage.sync`**, read solely by the service worker.
_Avoid_: Settings blob, credentials object

**Generated Draft**:
The single reply text a generation returns to the popup. The user can copy it, or from Phase 8 insert it unchanged into the exact composer that started the Inline Targeting Session (Draft Insertion). It is never posted, never persisted, and never ranked against alternatives. From Phase 7 its Tone, Intent and Response Length are shaped by the user's Generation Preferences (Phase 6 built the controls; Phase 7 wired them into the prompt). Multiple suggestions remain out of scope.
_Avoid_: Suggestion, completion, auto-reply

**Draft Insertion**:
Writing a Generated Draft into the exact Eligible Comment Composer or Reply Composer that started the Inline Targeting Session, on the user's explicit click, through the browser's editing pipeline. Refused if the editor was replaced, the route changed, the session was superseded, or the editor holds text the user wrote — modaicom's own untouched prior insertion from the same session excepted. Never submits; the user still clicks LinkedIn's Post or Reply control.
_Avoid_: Auto-fill, paste, publish, auto-reply

**Insertion Failure**:
A typed Draft Insertion outcome surfaced to the popup as fixed copy: `editor-unavailable`, `route-changed`, `editor-not-empty`, `insert-failed`, or `wrong-tab`. The Generated Draft and its Copy action stay available on every failure.
_Avoid_: Insert error string, silent no-op

**Generation Error**:
The provider-independent failure union surfaced to the popup as fixed copy: `provider-not-configured`, `api-key-missing`, `transmission-not-consented`, `invalid-preferences` (the selected tone/intent/length failed validation at the service-worker message boundary), `authentication-failed`, `rate-limited`, `request-timeout`, `network-error`, `provider-error`, `invalid-response`, `generation-cancelled`. Raw provider errors, HTTP status text, and response bodies are never surfaced.
_Avoid_: Provider exception, error message string

**Suggestion**:
The future capability to generate and rank multiple candidate responses. Phase 5 produces exactly one Generated Draft; ranked suggestions are deferred. A Suggestion is never published automatically.
_Avoid_: Published comment, automatic reply

**Response Controls**:
The Phase 6 capability giving the user three deliberate, typed choices over a Generated Draft — Tone, Intent and Response Length — with no free-text prompt field, no user-created tones or intents, and no personality learning. The LinkedIn DOM adapter and the AI Provider layer are unaware of these choices.
_Avoid_: Prompt settings, style options, custom instructions

**Tone**:
How a Generated Draft should sound, chosen from a fixed v1 set of `professional`, `friendly`, `confident`, `thoughtful`. Stored and validated as the `id` only; the display label and the underlying instruction text are never persisted or messaged.
_Avoid_: Voice, style, mood

**Intent**:
What a Generated Draft is *for*, chosen from a fixed v1 set of `support`, `add-insight`, `ask-question`, `answer`, `disagree`, `congratulate`. One universal set serves both a Post-Comment Interaction and a Comment-Reply Interaction in v1. Stored and validated as the `id` only.
_Avoid_: Goal, purpose flag, comment type

**Response Length**:
Roughly how long a Generated Draft should be, chosen from `short`, `medium`, `long`. The UI shows qualitative labels only (no word counts); an approximate sentence-count target is kept in the registry for later prompt assembly. Stored and validated as the `id` only.
_Avoid_: Word count, size, verbosity

**Generation Preferences**:
The typed triple `{ tone, intent, length }` capturing the user's current Response Controls. Persisted as the `id` triple in `chrome.storage.local` under `modaicom.generation.preferences` (never `chrome.storage.sync`), read on popup mount and written on change. A strict runtime guard requires exactly those three keys, each a known `id`. An invalid or absent stored value falls back to the default `{ tone: 'professional', intent: 'add-insight', length: 'medium' }`; an invalid value arriving over a runtime message (from Phase 7) fails with a typed Generation Error rather than silently defaulting. Contains no LinkedIn content.
_Avoid_: Settings blob, prompt config, user profile

**Preference Instructions**:
The ordered, provider-neutral instruction strings — `[intent, tone, length]` — that `preferencesToInstructions` derives purely from Generation Preferences. Terse imperative prose with no LinkedIn or provider nouns. Derived in `runGeneration`, rendered into the Generation Input's `system` string as a mandatory list in that order (Intent first). Consumed only inside the generation layer; never persisted, never messaged, never sent to the LinkedIn page.
_Avoid_: Prompt template, system prompt, instruction blob


**Generation Barrier**:
A short-lived per-tab ordering record that prevents an older Inline Targeting Session result from replacing a newer one across reinjection, navigation, or service-worker restart. It contains no LinkedIn content.

**Composer Adapter Version**:
The explicit version of the conservative structural allowlist used to recognize and classify Eligible Comment Composers and Reply Composers. Unknown variants fail closed until documented and fixture-tested.

**Comment Adapter Version**:
The explicit version of the conservative structural allowlist used to recognize Comment roots, Comment Body regions, Comment Authors, and comment collapse controls. Unknown markup fails closed until documented and fixture-tested.

## Retired

Terms from the abandoned popup-driven feed-selection UX. Kept here so older commits and ADR-0003's history stay readable; not part of the active vocabulary.

**Feed Selection Session**:
Interaction in which modaicom presented per-post Selection Controls for currently loaded Top-Level Feed Posts.

**Selection Control**:
A temporary per-post “Use this post” action attached to one Top-Level Feed Post during a Feed Selection Session.

**Selection Banner**:
A temporary page-level affordance from the Feed Selection Session UX.

**Selected Feed Post**:
The one Top-Level Feed Post explicitly chosen by the user during a Feed Selection Session.

**Selection Snapshot**:
The fixed candidate set captured for a Feed Selection Session.

**Feed Targeting Outcome**:
A typed result from the feed-selection flow, covering successful selection, cancellation, candidate-discovery or injection failure, ambiguity, and stale-target detection.
