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

LinkedIn serves two frontends — `legacy` on individual `/posts/...` pages, `sdui`
on the home `/feed/`. See [ADR-0005](../adr/0005-linkedin-markup-regimes.md) and
the selector reference in [linkedin-selectors.md](./linkedin-selectors.md).

Feed-surface smoke testing must click **Comment** on a post first: on the `sdui`
feed the comment composer is lazily mounted, so the inline trigger appears next
to the composer that opens, not on the collapsed post. An always-visible feed
trigger is tracked as follow-up work.
