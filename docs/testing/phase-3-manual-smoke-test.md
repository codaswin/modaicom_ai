# Phase 3 manual Chrome smoke test

**Status: Pending validation**

Phase 3 may be marked **Complete** only after both surface rows contain dated passing results.

Record only the date, browser/extension build identifier, tested surface category, pass/fail result, and a short non-sensitive symptom when applicable. Do not record LinkedIn URLs, content, screenshots, selectors, DOM dumps, or account information.

| Date | Browser / extension build | Surface category | Result | Non-sensitive symptom |
|---|---|---|---|---|
| | | Home feed (`/feed/`) | Pending | |
| | | Individual LinkedIn post page | Pending | |

Required observations:

- One accessible `modaicom` trigger appears beside each confidently recognized eligible comment composer.
- Unrelated editable elements receive no trigger.
- Clicking the trigger leaves the LinkedIn editor unfocused and unchanged.
- The popup displays the typed extracted context or fixed failure copy.
- SPA route changes remove stale modaicom UI and unsupported routes contain none.
- Teardown/reinitialization does not stack observers or history wrappers.

## LinkedIn markup regimes

As of 2026-08 LinkedIn serves two different frontends:

- **Legacy** on individual `/posts/...` and `/feed/update/urn:li:activity:...` pages:
  `article` / `.feed-shared-update-v2` roots with a `urn:li:activity:` identifier
  and an always-rendered `.comments-comment-box` composer.
- **Server-driven UI ("SDUI")** on the logged-in home `/feed/`: obfuscated class
  names, **no activity URN in the DOM**, posts rendered as `[role="listitem"]`
  inside `[data-testid="mainFeed"]`, post body in `[data-testid="expandable-text-box"]`,
  and a `tiptap` comment composer that only mounts **after the user opens a
  post's comment section**.

Feed-surface smoke testing must therefore click **Comment** on a post first; the
inline trigger appears next to the composer that opens, not on the collapsed
post. An always-visible feed trigger is tracked as follow-up work.
