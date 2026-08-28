# Phase 3 — LinkedIn Feed-Post Targeting

Status: Confirmed on 2026-08-28.

This specification is the shared understanding reached through the `grill-with-docs` session. It is intentionally limited to selecting one top-level post from LinkedIn’s home feed and extracting that selected post using the existing Phase 2 context boundary.

## Outcome

When the user is on exactly `https://linkedin.com/feed/` or `https://www.linkedin.com/feed/` (query strings and fragments allowed), modaicom lets them explicitly select one currently loaded Top-Level Feed Post. The selected post is then treated as the Primary Post and displayed using the existing Extracted Post Context preview.

The user remains in control: modaicom never infers intent from visibility, focus, position, or post count, and never publishes anything.

## User workflow

1. The popup opens on the supported `/feed/` route and shows `Select a LinkedIn post to continue.` with a `Start selection` action.
2. The user activates Start selection.
3. modaicom scans the currently loaded DOM once using the dedicated feed-targeting adapter.
4. If discovery is reliable, modaicom starts a Feed Selection Session, adds an accessible `Use this post` button to each eligible candidate, and shows a temporary Selection Banner with `Cancel selection`.
5. The user chooses exactly one post. All other per-post controls are removed immediately.
6. The selected candidate receives an Ephemeral Selection Token. The user closes or reopens the popup as needed.
7. On reopening, modaicom verifies the token and target identity, extracts the Selected Feed Post, and displays the existing read-only Extracted Post Context preview.
8. On cancellation or any terminal failure, temporary UI is removed and the popup returns to the start-selection state with actionable copy.

## Surface and candidate boundary

- Targeting is enabled only for HTTPS exact hosts `linkedin.com` and `www.linkedin.com` with pathname `/feed/`. `/feed` without the trailing slash and every other path are unsupported.
- Query strings and fragments do not affect route eligibility.
- Feed Candidate Discovery uses a dedicated adapter with conservative LinkedIn post-root selectors.
- Only Top-Level Feed Posts directly belonging to the home-feed collection are eligible.
- Nested shared posts, comments, replies, embedded content, and unrelated cards are excluded explicitly.
- The adapter returns `no-candidates` when no eligible candidate is found and `ambiguous-candidates` when it cannot establish a reliable distinct candidate set.
- The selection session captures a Selection Snapshot of the currently loaded candidates. Newly loaded or rerendered posts require cancellation and a new session; no MutationObserver or continuous retargeting is used.

## Selection controls and lifecycle

- Each eligible candidate receives a temporary, keyboard-operable button labelled exactly `Use this post`.
- Each button is explicitly associated with its candidate post for accessible context.
- A temporary Selection Banner states `Select a LinkedIn post to continue.` and provides `Cancel selection`.
- Selecting one candidate immediately removes all other per-post controls.
- Controls, banner, and token exist only during the explicit Feed Selection Session.
- Cleanup runs best-effort on success, cancellation, no-candidates, ambiguous-candidates, selection-failure, stale-target, required-data failure, unexpected error, and observable popup/tab closure.
- Cancellation is a normal user outcome. It returns `cancelled` and the popup shows `Select a LinkedIn post to continue.` with `Start selection`.

## Target verification and extraction

- The selected DOM node is identified by an Ephemeral Selection Token, not by position or a fuzzy text/author match.
- Before extraction, modaicom verifies that the token exists, the node is attached, the node remains a valid Top-Level Feed Post, and any available stable identifier has not changed.
- A missing token, detached node, invalid candidate status, or changed stable identifier returns `stale-target`.
- Stale targets fail closed; modaicom never substitutes another post.
- On successful verification, the selected feed post is passed through the existing Phase 2 extraction boundary and treated as the Primary Post.
- Required fields and failures are unchanged: missing Original Authored Text returns `no-text`; missing author display name returns `author-not-found`; neither returns partial context.
- Successful output is the existing Extracted Post Context contract: required author display name and post text, plus optional author headline, stable post identifier, and visible publication/time label when reliable.
- URLs are excluded from the context.

## Typed outcomes

Feed targeting adds these outcomes:

- `no-candidates`
- `ambiguous-candidates`
- `selection-failure`
- `cancelled`
- `stale-target`

The existing Phase 2 outcomes remain authoritative for selected-post extraction: `success`, `no-text`, `author-not-found`, `collapsed-post`, `post-not-found`, `ambiguous-post`, `unsupported-surface`, and `unexpected-error`.

The popup presents fixed, actionable copy for each outcome and never exposes selectors, raw HTML, URLs, or exception details.

## Privacy and architecture boundary

- Selection and extraction are on-demand and read-only.
- Temporary `activeTab`/scripting access remains sufficient; no persistent LinkedIn host permission, static content script, background observer, or storage is introduced.
- Selected context remains in popup memory only.
- No URL or post content is persisted, logged, analyzed, transmitted, or sent to an external service.
- ADR-0002 remains the governing on-demand LinkedIn extraction boundary; this slice does not change that privacy or permission decision.
- ADR-0001 continues to prohibit automatic publication.

## Testing and verification

Deterministic sanitized DOM fixtures must cover:

- strict `/feed/` route gating, including query/fragment acceptance and `/feed` rejection;
- top-level candidate discovery and exclusion of nested/shared/comment/reply/embedded/unrelated content;
- zero and ambiguous candidate outcomes;
- accessible, associated `Use this post` controls;
- selection snapshot behavior and immediate removal of other controls;
- cancellation and cleanup on every terminal outcome;
- selected-target extraction through the Phase 2 contract;
- missing token, detached node, invalid candidate, changed identifier, and stale-target outcomes;
- popup start-selection, loading, success preview, retry, cancellation, and typed failure states.

Run the full required verification:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

## Completion criteria

Phase 3 is complete when the supported `/feed/` route is gated exactly, the user can explicitly select one reliable Top-Level Feed Post, stale or ambiguous targets fail closed with typed outcomes, cleanup is guaranteed, the selected post is displayed through the Phase 2 Extracted Post Context preview, all deterministic tests and checks pass, and no out-of-scope capability is present.

## Explicit non-goals

- Individual comment/reply targeting or comment-thread extraction
- LLM providers, prompt generation, tone, intent, or length controls
- Suggestion generation, ranking, or selection
- Editor insertion, draft replacement, automatic submission, or publishing
- Automatic selection based on visibility, focus, position, or post count
- Continuous content scripts, MutationObserver-based tracking, or background extraction
- URL/content persistence, logging, analysis, telemetry, network transmission, or external services
- Feed routes other than `/feed/`
