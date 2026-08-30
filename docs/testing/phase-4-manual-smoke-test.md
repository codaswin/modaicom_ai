# Phase 4 manual Chrome smoke test — Targeted Comment / Reply Extraction

**Status: Pending validation**

Record only the date, browser/extension build identifier, surface, pass/fail, and
a short non-sensitive symptom. No LinkedIn URLs, content, screenshots, selectors,
or account data.

| Date | Browser / extension build | Surface | Result | Non-sensitive symptom |
|---|---|---|---|---|
| | | Legacy post — reply composer | Pending | |
| | | Legacy post — top comment composer (regression) | Pending | |
| | | SDUI `/feed/` — reply composer (must get NO trigger) | Pending | |

Required observations:

- On an individual `/posts/…` or `/feed/update/urn:li:activity:…` page, click
  **Reply** on a top-level comment → one `modaicom` trigger appears beside the
  reply composer (aria-label "modaicom — draft a reply").
- Click it → the popup shows **"Replying in [Author]'s thread"**, the comment
  text, and the Owning Post context below under "On this post".
- The comment editor is never focused, read, or changed.
- Opening reply boxes on two different comments → two independent triggers; closing
  one removes only its trigger.
- Replying to a *nested* reply → the trigger targets the **thread's top-level
  comment** (disclosed as "…'s thread"), never a nested reply.
- Deleting / collapsing the target comment → the popup shows the matching
  `comment-*` copy with Retry, never wrong data.
- The post's own top-level comment composer still gets a `post-comment` trigger
  (Phase 3 regression check).
- On the `sdui` home `/feed/`, opening a reply box shows **no** `modaicom`
  trigger (neither reply nor the old mislabelled comment trigger).
- SPA route changes and thread re-sorts remove stale triggers; teardown /
  reinitialization does not stack observers.

See [ADR-0006](../adr/0006-comment-reply-interaction-shape.md) and
[linkedin-selectors.md](./linkedin-selectors.md).
