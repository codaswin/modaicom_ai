# Use an exact-host content script for inline LinkedIn targeting

Status: accepted on 2026-08-28.

The inline `modaicom` trigger must exist beside eligible LinkedIn comment composers while the popup is closed, so Phase 3 uses a static `document_idle` content script on the exact LinkedIn hosts with a narrow structural MutationObserver. An explicit click extracts only the exact Owning Post and sends a typed result to a service worker, which owns a five-minute, tab-keyed `chrome.storage.session` relay for popup handoff. This decision partially supersedes ADR-0002 only where it prohibited persistent exact-host access and static content scripts; its no-content-persistence, no-logging, no-transmission, read-only, and no-automatic-action guarantees remain mandatory.


## Operational durability constraints

The content script uses a versioned conservative composer-adapter allowlist; unknown LinkedIn markup fails closed. Bootstrap discovery may retry only within a bounded five-attempt/one-second window and observes validated narrow containers, never the document body.

Relay and generation operations are serialized per tab. A separate `modaicom.generation.<tabId>` session record stores only schema version, session identity, generation, monotonic counter, creation, and expiry metadata. It shares the five-minute expiry policy with relay records, retains barriers through route cleanup, and is removed immediately on tab close. This prevents late results from older content-script sessions or service-worker races from overwriting newer clicks.

The phase is not complete until a dated manual Chrome smoke test passes on both supported surfaces.
