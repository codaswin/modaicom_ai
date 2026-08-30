# Phase 5 manual Chrome smoke test — AI Provider Foundation

**Status: Pending validation**

Record only date, browser / extension build, area, pass/fail, and a short
non-sensitive symptom. Never record API keys, LinkedIn content, or provider
responses.

| Date | Browser / extension build | Area | Result | Symptom |
|---|---|---|---|---|
| | | Options: configure + consent + permission | Pending | |
| | | Options: Test key (valid / invalid) | Pending | |
| | | Popup: Generate happy path | Pending | |
| | | Popup: not-configured → Open settings | Pending | |
| | | Popup: Stop / popup-close cancellation | Pending | |
| | | Error paths (401 / 429 / offline) | Pending | |

## Setup

1. `npm run check`, load `dist/` unpacked.
2. Open modaicom options (`chrome://extensions` → Details → Extension options).
3. Enter a scoped OpenAI API key (recommend a project key with a spend cap),
   leave the model default, tick the consent checkbox, **Save**.
4. Confirm Chrome prompts for access to `api.openai.com` and that denying it
   surfaces a clear message; grant it.
5. Click **Test key** → "Provider reachable — key works". Then temporarily set a
   bad key and confirm "Test failed: authentication-failed".

## Generate

6. On a `legacy` LinkedIn post (`/posts/…`), click the `modaicom` trigger beside
   the comment composer, open the popup, click **Generate reply**.
7. Within ~10 s a draft appears in a read-only box with **Copy** and
   **Regenerate**. Copy it and paste into LinkedIn's editor by hand — modaicom
   inserts nothing.
8. On a comment-reply trigger, confirm the draft responds to the *comment* and
   the popup header reads "Replying in …'s thread".

## Privacy spot-check (dev)

9. With DevTools open on the service worker, watch the Network tab during a
   generation. The single request to `api.openai.com/v1/chat/completions` must
   contain **only** the authored post/comment text in `messages` — no author
   names, no `urn:li:activity:` / `urn:li:comment:`, no URL, no page HTML. The
   `Authorization` header carries the key; the key appears nowhere else.

## Lifecycle

10. Click **Generate**, then **Stop** → returns to the Generate button, no draft.
11. Click **Generate**, then close the popup mid-request → reopen; no draft, no
    error spinner stuck. (The SW aborted on port disconnect.)
12. Disconnect the network, **Generate** → "Could not reach your provider" +
    Retry. Reconnect, Retry → draft.
13. Reload the extension mid-generation → popup shows an error / ready state, not
    a hang. Key / config / consent survive.

See [ADR-0007](../adr/0007-linkedin-content-transmission-and-byok-boundary.md) and
[ADR-0008](../adr/0008-ai-provider-network-and-key-storage-boundary.md).
