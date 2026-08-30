# Route the popup's individual-post extraction through the content script

Status: accepted on 2026-08-30. Partially supersedes ADR-0002.

The popup's Phase 2 individual-post fallback ran the extractor with
`chrome.scripting.executeScript({ func: extractPostContextInPage })`. That call
serialises the function and re-evaluates it in the page with no module scope, so
the adapter helpers it closes over (`classifyLinkedInRoute`, the post-adapter
selectors, `findOriginalBody`, …) were always `undefined` in the page: every
fallback extraction threw and returned `unexpected-error`. It had never worked in
a real browser.

The popup now sends a versioned `REQUEST_PAGE_EXTRACTION` message to the
persistent Phase 3 content script (`chrome.tabs.sendMessage`), which runs the
extractor in the page — where the module scope is intact — and returns the typed
`PostExtractionResult`. There is now one extractor code path, exercised by both
the inline trigger and the popup fallback.

Consequences:

- The `scripting` permission is removed; only `activeTab` and `storage` remain.
  (`activeTab` still reads the active-tab URL for the popup's "open LinkedIn"
  state on non-LinkedIn pages.)
- The fallback now depends on the content script being injected and initialised.
  If it is not (a slow-load injection race), `sendMessage` rejects and the popup
  shows `unexpected-error` — the same failure kind as before, for a new reason.
  The content script matches the same hosts and runs at `document_idle`, so it is
  almost always up by the time the popup opens; a bounded retry is deferred until
  smoke testing shows the race actually bites.
- Message envelopes now have a single dependency-free home
  (`src/shared/protocol.ts`: `RELAY_VERSION`, the message-type union, guards),
  satisfying ADR-0003's "strict versioned discriminated envelopes".

ADR-0002's on-demand, read-only, no-persistence, no-transmission, no-logging, and
no-automatic-action guarantees are unchanged; only its "on-demand
`executeScript`, no persistent content script" mechanism is superseded (already
partially superseded by ADR-0003).
