# Phase 3 — LinkedIn Feed-Post Targeting via Inline Trigger

Status: Revised and confirmed on 2026-08-28.

This specification defines the smallest inline-trigger slice for identifying one LinkedIn post from a genuine comment composer and extracting that post through the existing Phase 2 boundary. It supports only the home feed and recognized individual-post pages.

## Outcome

When modaicom runs on an exact supported LinkedIn host, a static content script may render a branded `modaicom` Inline Trigger beside an Eligible Comment Composer. The user’s explicit click on that trigger targets the composer’s Owning Post and starts read-only extraction. The selected result is handed to the popup for display through a short-lived service-worker relay.

The popup never scans feed candidates or starts targeting. It remains an on-demand fallback for individual-post extraction when no relay exists.

## Supported surfaces and permissions

- The content script matches only `https://linkedin.com/*` and `https://www.linkedin.com/*`.
- It internally enables reconciliation only on `/feed/` and recognized individual-post route families such as `/posts/...` and `/feed/update/urn:li:activity:...`.
- Profile, search, company, group, messaging, and all other LinkedIn surfaces receive no Inline Trigger.
- The manifest adds exact LinkedIn `host_permissions`, a static `document_idle` content script, a service worker, and the `storage` permission required for `chrome.storage.session`.
- Existing `activeTab` and `scripting` permissions remain only because the popup’s individual-post fallback still uses them. No broader permission is added.

## User workflow

1. The content script performs one structural reconciliation after `document_idle` and starts one narrow, debounced MutationObserver.
2. On a supported surface, it identifies genuine Eligible Comment Composers and their Owning Posts.
3. It renders one accessible, keyboard-operable branded `modaicom` Inline Trigger per distinct Owning Post. The trigger is adjacent to the editor and does not wrap or alter it.
4. The user explicitly clicks the Inline Trigger. The trigger becomes subtly busy/disabled and ignores duplicate clicks.
5. The content script marks the exact Owning Post ephemerally and invokes the Phase 2 extractor against that exact element and current route.
6. Only the typed plain extraction result is sent to the service worker as a versioned runtime message. DOM nodes, HTML, URLs, editor values, and raw exceptions never leave the content script.
7. The service worker stores the latest valid Session Relay Result for that tab in `chrome.storage.session`.
8. When the popup opens, it requests the relay through the service worker. The worker validates expiry, returns the typed result, and clears it before completing the read. The popup shows the read-only context or fixed failure copy.
9. If no valid relay exists, `/feed/` shows `Select a LinkedIn post to continue.` with no targeting action in the popup; an individual-post page preserves the existing on-demand Phase 2 fallback.

## Editor and Owning Post boundary

- Eligible Comment Composers are only recognized LinkedIn comment composer roots (textarea or contenteditable variants) with a validated association to exactly one Owning Post.
- The adapter must reject replies, messages, search fields, post composers, nested/shared posts, and unrelated editable UI.
- If ownership is ambiguous or the post root is not a valid Top-Level Feed Post or Primary Post, no trigger is rendered and no authored/editor text is read.
- Multiple editor representations for one Owning Post are deduplicated by reliable stable post identity, with a unique current-session DOM fallback only when necessary.
- Feed targeting selects only Top-Level Feed Posts. Individual-post targeting selects the page’s Primary Post.

## SPA and observer behavior

- The content script runs at `document_idle`.
- One debounced MutationObserver per document observes only structural changes beneath validated feed/editor containers. It never reads post text, comment text, or editor values.
- Reconciliation is idempotent: newly eligible editors receive a trigger, duplicate triggers are removed, and orphaned triggers/tokens are removed when owners disappear or become invalid.
- `popstate` and carefully wrapped `history.pushState`/`replaceState` detect SPA route changes while preserving original History API behavior exactly.
- A route change removes old Inline Triggers and target markers, clears that tab’s relay through the service worker, and reconciles only the new supported route. Unsupported routes contain no modaicom controls.
- Observer and route hooks disconnect during content-script/document teardown.

## Extraction and privacy boundary

- The Phase 2 adapter gains an exact-root entry point accepting the validated Owning Post Element and current supported route. It reuses existing field extraction, normalization, required-field failures, collapsed-text handling, and URL exclusion.
- Extraction begins only after the explicit Inline Trigger click. Pre-click observation is structural only.
- The editor is never focused, blurred, read, mutated, wrapped, replaced, or used as extraction input.
- The content script sends only a typed plain result to the service worker. Runtime messages use strict versioned discriminated envelopes such as `{ version: 1, type: 'INLINE_EXTRACTION_RESULT', result }`; malformed or unknown messages are ignored without logging.
- Content-script message tab identity is always derived from `sender.tab.id`, never trusted from a payload field.
- The service worker owns all `chrome.storage.session` access. It uses a namespaced key containing the tab ID, typed result, schema version, created timestamp, expiry timestamp, and a per-tab generation/timestamp. It rejects expired or malformed records.
- Relay expiry is fixed at five minutes. Reads and writes check expiry; expired records are cleared opportunistically. `tabs.onRemoved` and route-clear messages remove records. Per-tab operations serialize read/validate/remove so concurrent popup reads cannot both consume a result. Older asynchronous click results cannot overwrite newer generations.
- No URL, HTML, DOM, editor text, raw exception, authored content outside the selected context contract, logging, analytics, network transmission, or long-term persistence is allowed.
- ADR-0003 records the deliberate partial supersession of ADR-0002 for exact-host access and static content scripts. ADR-0002’s privacy, read-only, and no-automatic-action guarantees remain in force.

## Typed outcomes and UI

The existing Phase 2 outcomes remain authoritative: `success`, `no-text`, `author-not-found`, `collapsed-post`, `post-not-found`, `ambiguous-post`, `unsupported-surface`, and `unexpected-error`.

Feed/inline lifecycle outcomes include `cancelled`, `stale-target`, and `selection-failure` where applicable. The popup displays fixed, actionable copy and never exposes selectors, storage state, URLs, raw HTML, or exceptions.

While extraction runs, only the Inline Trigger’s subtle busy/disabled state changes. On failure it is restored for a fresh explicit click; no automatic retry occurs. Relay and target state are cleared after terminal outcomes.

## Testing and verification

Deterministic fixtures and unit tests must cover:

- exact host and route gating;
- feed and individual-post editor discovery;
- exclusion of replies, nested/shared posts, messages, search fields, post composers, and unrelated editable UI;
- exact Owning Post association and ambiguous-owner rejection;
- trigger accessibility, adjacency, deduplication, unique identity, busy state, and editor non-mutation;
- MutationObserver reconciliation, orphan cleanup, route changes, History API preservation, and teardown;
- exact-root extraction and every Phase 2 typed outcome;
- versioned message validation and sender-derived tab identity;
- service-worker relay expiry, generation ordering, tab isolation, serialized read/clear, route clear, and tab close;
- popup relay display, neutral no-relay states, and individual-page fallback;
- absence of pre-click authored/editor text reads, logging, storage outside session, network calls, or automatic LinkedIn actions.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Completion criteria

Phase 3 is complete when the exact-host content script renders only validated, deduplicated Inline Triggers on the feed and individual-post surfaces; an explicit click extracts exactly one Owning Post; SPA changes and teardown clean up safely; typed results relay through five-minute tab-isolated session storage; the popup displays read-only context/failures; all deterministic tests and checks pass; and no out-of-scope capability is present.

## Explicit non-goals

- Popup-driven feed scanning or legacy `Use this post`/Selection Banner behavior
- Targeted comment or reply extraction, comment-thread context, or reply targeting
- Reading or modifying comment/editor text
- LLM providers, prompts, tone, intent, length, suggestions, ranking, or regeneration
- Editor insertion, draft replacement, submission, or publishing
- Automatic selection or automatic retry
- URL/content persistence, logging, analytics, network transmission, or external services
- Profile, search, company, group, messaging, or other unsupported LinkedIn surfaces
