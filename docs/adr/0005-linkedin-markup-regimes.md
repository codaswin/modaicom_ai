# Recognise two LinkedIn markup regimes; fail closed on a third

Status: accepted on 2026-08-30.

LinkedIn serves two structurally different frontends, and is mid-migration
between them:

- **`legacy`** — individual `/posts/...` and `/feed/update/urn:li:activity:...`
  pages: `article` / `.feed-shared-update-v2` roots carrying a `urn:li:activity:`
  identifier, an always-mounted `.comments-comment-box` composer.
- **`sdui`** (server-driven UI) — the logged-in home `/feed/`: obfuscated class
  names, **no activity URN anywhere in the DOM**, posts rendered as
  `[role="listitem"]` inside `[data-testid="mainFeed"]`, post body in
  `[data-testid="expandable-text-box"]`, and a `tiptap` comment composer that
  mounts only after the user opens a post's comments.

`feedMarkupRegime()` classifies the home feed as `legacy | sdui | unknown` from
container presence. Both known regimes are recognised by the post and composer
adapters; `unknown` fails closed (no trigger) and is reported — a dev-build
`console.warn` and a `FEED_REGIME_UNKNOWN` structural diagnostic in production
(consistent with the "no logging" privacy line).

Decisions specific to `sdui`:

- **Trigger placement is composer-anchored** (unchanged from ADR-0003). Because
  the composer is lazily mounted, on the feed the trigger appears next to the
  composer once the user opens a post's comments, not on the collapsed post. An
  always-visible feed trigger is deferred.
- **Per-post identity is the framework `componentkey`** on the post's list-item
  wrapper — session-scoped, opaque, never returned in extracted context. Used
  only for inline-trigger deduplication. Its `expanded...` prefix is unverified
  (see the note in `stablePostIdentity`).
- **Reply vs. comment**: SDUI gives reply editors the identical
  `aria-label="Text editor for creating comment"`, so the first such editor in
  document order within a post owns the trigger; later ones are treated as reply
  composers. The edge where a user opens a reply without the top composer mounted
  is accepted.
- **Collapsed detection is structural**: the presence of
  `[data-testid="expandable-text-button"]`, which LinkedIn removes (not relabels)
  on expansion — locale-independent, unlike the legacy "see more" text check.
- **Author extraction is best-effort**: parsed from the avatar `img[alt]` ("View
  NAME's profile") with an actor-link-text fallback. On a non-English UI it
  degrades to `author-not-found`, never a wrong name. The authored **text body**
  remains language-agnostic (preserved without parsing or translating).

Selectors earn their place by being verified against live LinkedIn (ADR-0003):
`docs/testing/linkedin-selectors.md` holds the per-regime table, a verification
snippet, and a dated log. A selector for a markup variant we cannot currently
point at is removed, not kept "just in case".

## Reconcile robustness on `sdui` (revision, 2026-08-31)

The `sdui` feed hydrates progressively and mutates continuously, which made the
debounced-MutationObserver-only approach from ADR-0003 unreliable: the observer
could be scoped to `<main>` before `[data-testid="mainFeed"]` existed, and a burst
of feed mutations could starve the 50 ms trailing debounce so a newly opened
comment composer was never reconciled (the trigger "sometimes" appeared, and a
page refresh was the workaround). The reconcile loop now: keeps a coarse observer
on `<main>` alongside the precise feed-container scope; keeps bootstrap discovery
retrying (longer budget) until the real feed container is found; adds a
max-wait so the debounce cannot be starved; and runs a **low-frequency
(~1.5 s) idempotent safety re-scan** while a supported route is open. This
relaxes ADR-0003's "no continuous polling" for the feed surface only — the
re-scan is structural-only, reads no authored/editor text, and is the minimum
needed to make a lazily-mounted composer's trigger appear reliably.
