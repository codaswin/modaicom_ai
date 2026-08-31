# Wiring Response Controls into generation: prompt, transport, provider tuning

Status: accepted on 2026-08-31 (grill-with-docs). Builds on ADR-0007, ADR-0008,
ADR-0009. Supersedes the Phase 6 "Phase 7 handoff" notes in ADR-0009.

Phase 6 shipped the Tone / Intent / Length controls, persistence, validation, and
`preferencesToInstructions` — but nothing called that function, so the controls
changed nothing in a generated draft. This ADR records how Phase 7 connects them
and rebuilds the prompt so the selection reliably steers the model.

## Where the selection crosses the boundary

- `GENERATION_PROTOCOL_VERSION` bumps **1 → 2**. `RequestGenerationMessage` gains
  a **`preferences: GenerationPreferences`** field, sibling to `request` — not
  folded into `GenerationRequest`, which stays authored-text-only so the ADR-0007
  minimisation guarantee keeps its single, narrow subject.
- The v2 bump is a **lockstep cutover**: every generation message
  (`GET_PROVIDER_STATUS`, `RECORD_TRANSMISSION_CONSENT`, `TEST_PROVIDER`, the port
  messages), their guards, and the options-/popup-side call sites move to `v: 2`
  together. The popup and options page ship in the same build as the service
  worker, exactly as with `RELAY_VERSION`.
- **Validation** (`isGenerationPreferences`) runs in `background/generation.ts` at
  the message boundary. An absent, malformed, or unknown-id `preferences` value
  returns a new typed error kind **`invalid-preferences`** and makes no provider
  call — never a silent fall back to the default (the Phase 6 grill decided a
  message boundary rejects; storage reads still fall back). `invalid-preferences`
  is **retryable** in the popup: the popup's stored triple is always a valid typed
  value, so the error only occurs on transient protocol skew during an extension
  update, where Retry after the reload works. (The grill said "Open settings", but
  that points at the wrong surface — tone/intent/length are popup controls.)
- **Mapping** (`preferencesToInstructions`) runs in `runGeneration`
  (`features/generation/generate.ts`), colocated with `buildGenerationInput`.
  `background/` stays thin: transport, sender auth, storage, validation.
- `TEST_PROVIDER` supplies `DEFAULT_GENERATION_PREFERENCES` — still a minimal call
  with zero LinkedIn content.
- The popup's `GET_PROVIDER_STATUS` round-trip has a third outcome besides
  configured / not-configured: **unreachable**. A rejected or malformed reply
  (typically a stale service worker after this v1 → v2 bump) is kept distinct
  from a genuine `configured: false` — the panel says "reload the extension" with
  Retry rather than "Open settings", and a DEV build logs a `[modaicom]`
  breadcrumb (ADR-0008). A configured-but-unconsented status gets its own
  one-line "consent on the settings page" copy.

## Prompt construction

`buildGenerationInput(request, instructions: readonly string[])` gains a second
argument, supplied by `runGeneration` from `preferencesToInstructions`.

- The three instructions render into the **`system`** string as a mandatory
  bulleted list, in `[intent, tone, length]` order (Intent first — it is the
  anchor), under a lead-in: *"Your reply must do all of the following:"*. No
  per-bullet labels in v1 (each instruction stands alone); adding
  `Purpose:` / `Tone:` / `Length:` prefixes is a reserved one-line follow-up.
- The base `system` prompt is **stripped of "Write 2 to 4 sentences, warm but not
  effusive"** — length and tone now come only from the instruction list, which
  otherwise fights the controls. The invariants stay: output only the reply (no
  preamble, quotes, sign-off), no hashtags, no emoji unless the source uses them,
  reply in the source's language.
- Authored text and the post-comment / comment-reply framing stay in **`user`**,
  unchanged.

## Instruction text revision (Phase 6 registry)

The Phase 6 strings were too soft to steer reliably, and the Length ranges
overlapped ("one or two" ∩ "two to four" = 2), so a model's natural ~2–3-sentence
comment satisfied all three. Revised:

- **Length** — non-overlapping sentence ranges as imperatives, each with a
  density instruction: short *"Write 1–2 sentences. Make a single point and
  stop."*; medium *"Write 3–4 sentences. Develop one idea with a supporting
  reason or example."*; long *"Write 5–7 sentences, up to two short paragraphs.
  Develop the point fully — still a comment, not an article."* Sentence counts
  (which models track well), not word counts (which are not guaranteed).
  `approxTarget` realigned to the same ranges.
- **Tone / Intent** — sharpened to a concrete lever plus an explicit "don't"
  (e.g. confident: *"…No hedging ('maybe', 'I think', 'it seems'), no filler
  qualifiers, no apologies."*; add-insight: *"…Do not restate the post."*). Still
  terse imperatives, still provider-/LinkedIn-neutral. The Phase 6
  `MAX_INSTRUCTION_WORDS` test bound rises (25 → ~40).

## Provider request tuning

`GenerateOptions` gains optional `temperature` and `maxTokens`.

- **`temperature: 0.6`** (fixed) — OpenAI's default of 1.0 maximises run-to-run
  variance, which is much of why "changing Tone has little effect". 0.6 follows
  instructions while leaving Regenerate genuinely different.
- **`maxTokens`** derived from the selected length (short ≈ 160, medium ≈ 320,
  long ≈ 640 — roughly 2× each sentence target) as a **cost and runaway
  backstop**, not the length mechanism. Normal output never truncates; a
  `finish_reason: "length"` response with non-empty content is still returned as
  `ok: true` rather than erroring.
- `openai.ts` puts `temperature` and `max_tokens` in the request body. The
  `AIProvider` contract is unchanged in shape (`{system,user}` + options →
  `GenerationResult`); a future Anthropic/Gemini provider maps the same two
  options onto its own field names.
- Malformed-response handling is unchanged in policy, with test coverage widened:
  `choices: []`, missing / empty / whitespace `message.content`, and an HTTP-200
  body shaped `{ error: {...} }` all map to `invalid-response`. No refusal
  detection — a provider that returns "I can't help with that" as normal content
  is shown to the user; string-matching for refusals is fragile.

## One draft, not many

v1 generates exactly one draft per Generate (Regenerate = another call).
`GenerationResult` / `GenerationResultMessage` stay single-`text`; the
`AIProvider` contract returns one `text`. Multiple ranked candidates remain the
deferred **Suggestion** capability — adding them would change the provider
contract, the result message, the popup, and ADR-0007's "one billable call" all
at once, for a feature that would only mask weak instructions, not fix them.

## The current selection is authoritative

- `usePreferences` gains a `ready` flag. `GenerationPanel` disables Generate (and
  Regenerate) until the stored value has hydrated — invisible in practice (a few
  ms, behind the time spent reading the context), but it closes the hole where an
  early click sent `DEFAULT_GENERATION_PREFERENCES` over a user's stored
  non-default choice.
- The in-memory hook state — updated synchronously on every change, persisted
  best-effort for the next session — is the single source of truth within a popup
  session. No storage round-trip on the Generate path (which would race an
  in-flight `writePreferences`).
- `generate(request, prefs)` and Regenerate both read the live state. The service
  worker never caches preferences; every `REQUEST_GENERATION` carries its own
  validated triple, so "current selection per request" holds by construction.
- Regenerate reuses the already-extracted `request` (the LinkedIn context does
  not change between draft and regenerate) and only re-reads the preferences.
- A second `REQUEST_GENERATION` on a port that already has a generation in flight
  is ignored (defensive; not reachable from the current popup).

## Not doing yet

Disabling the Retry button for `retryAfterMs` with a countdown; per-bullet
instruction labels; multiple suggestions; anything on the Phase 6/7 exclusion
lists (editor insertion, auto-posting, new providers, local AI, style learning,
analytics).

## Logging

Unchanged (ADR-0008). The `{tone,intent,length}` ids are not secret but are not
logged; `invalid-preferences` is a *kind* and may appear in the DEV-build
`console.warn({ kind })` breadcrumb. Extracted LinkedIn content, API keys, and
generated drafts stay unlogged.
