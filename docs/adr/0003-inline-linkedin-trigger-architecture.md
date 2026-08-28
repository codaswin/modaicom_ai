# Use an exact-host content script for inline LinkedIn targeting

Status: accepted on 2026-08-28.

The inline `modaicom` trigger must exist beside eligible LinkedIn comment composers while the popup is closed, so Phase 3 uses a static `document_idle` content script on the exact LinkedIn hosts with a narrow structural MutationObserver. An explicit click extracts only the exact Owning Post and sends a typed result to a service worker, which owns a five-minute, tab-keyed `chrome.storage.session` relay for popup handoff. This decision partially supersedes ADR-0002 only where it prohibited persistent exact-host access and static content scripts; its no-content-persistence, no-logging, no-transmission, read-only, and no-automatic-action guarantees remain mandatory.
