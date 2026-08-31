# Phase 7 — AI Suggestion Generation

Status: Specified on 2026-08-31 (grill-with-docs → to-spec). Builds on ADR-0007,
ADR-0008, ADR-0009, and ADR-0010.

## Problem Statement

The Phase 6 Tone / Intent / Length controls change nothing in a generated draft.
The user picks "Short, Confident, Disagree", clicks Generate, and gets the same
kind of medium-length, mild, generic comment as every other setting — so the
controls feel broken and the draft still needs rewriting.

The cause is that the selection is never sent: `GenerationPanel` builds a
text-only request, `useGeneration` posts no preferences, `buildGenerationInput`
uses a fixed system prompt, and `preferencesToInstructions` is called nowhere
outside tests. Compounding it, the fixed prompt hardcodes *"Write 2 to 4
sentences, warm but not effusive"* — "medium length, friendly tone" baked in,
which would fight the controls even once they were connected.

## Solution

Wire the current selection through to the model and rebuild the prompt so the
selection reliably steers it:

- The popup sends the validated `{ tone, intent, length }` id triple as a new
  field on the generation message (protocol bumps to v2).
- The service worker validates it, maps it to three instruction strings, and
  renders them into the prompt as a mandatory list — Intent first.
- The fixed prompt loses its baked-in length and tone; those now come only from
  the instructions.
- The instruction strings themselves are sharpened, and the Length instructions
  get non-overlapping sentence ranges so Short / Medium / Long actually differ.
- The provider call sets `temperature` (lower, so instructions dominate the
  run-to-run noise) and a length-derived output ceiling as a cost backstop.
- A `ready` gate guarantees the *current* stored selection is used, never a
  default flashed before the stored value loads.

v1 still generates exactly one draft per Generate; Regenerate produces another.
Nothing is inserted or posted.

## User Stories

1. As a user, I want the Tone I pick to visibly change how the draft reads, so
   that the control is worth using.
2. As a user, I want the Intent I pick to change what the draft is trying to do
   (support, question, disagreement…), so that I get a comment with the right
   purpose.
3. As a user, I want Short, Medium and Long to produce noticeably different
   lengths, so that the Length control isn't decorative.
4. As a user, I want the draft to reflect the controls as they are set *at the
   moment I click Generate*, so that a last-second change is honoured.
5. As a user, I want a change I make to a control and then Regenerate to be
   applied to the new draft, so that I can iterate on tone without starting over.
6. As a returning user with a saved preference, I want that saved preference used
   even if I click Generate immediately, so that I never silently get the default.
7. As a user, I want each Generate to still be one deliberate, single billable
   call, so that the cost model is unchanged.
8. As a user, I want one clear draft, not a wall of alternatives to evaluate, so
   that the tool stays quick to use.
9. As a user, I want Regenerate to give me a genuinely different draft, not the
   same sentences reworded, so that a second try is worth making.
10. As a user replying to a comment, I want the same controls to work there as on
    a top-level comment, so that behaviour is consistent.
11. As a user, I want a broken or empty provider response to show a clear,
    fixed-copy error and a Retry, not a blank draft or a crash.
12. As a user, I want a truncated draft (rare) shown to me anyway so I can
    Regenerate, rather than a hard error.
13. As a user, I want an impatient double-click on Generate or Regenerate to do
    nothing harmful, so that I don't fire two billable calls.
14. As a privacy-conscious user, I want only my authored-text and my three menu
    choices sent — never author names, URLs, identifiers, my draft, or the page —
    and I want the consent disclosure to say so.
15. As a privacy-conscious user, I want my tone/intent/length choices never
    written to a log.
16. As a maintainer, I want the LinkedIn DOM adapter to still know nothing about
    tone/intent/length, so that extraction stays a pure content adapter.
17. As a maintainer, I want the AI provider layer to still receive only
    `{ system, user }` plus numeric options — no modaicom vocabulary — so that
    providers stay interchangeable.
18. As a maintainer, I want the preference validation to happen once, at the
    service-worker message boundary, and reject unknown values with a typed error
    rather than letting them become prompt text.
19. As a maintainer, I want `buildGenerationInput` to stay a pure function I can
    test with a known instruction array, so that prompt construction is verifiable
    without a network or a provider.
20. As a maintainer, I want the protocol version bump handled as one lockstep
    cutover across every generation message and its call sites, so that there is
    no mixed-version window.
21. As a maintainer, I want deterministic tests (mocked `fetch`) proving the
    selected instructions and the numeric knobs reach the outbound provider
    request for every tone, intent and length.
22. As a maintainer, I want a manual smoke-test record for the parts only a real
    model can demonstrate (actual tone/intent/length fidelity).

## Implementation Decisions

### Transport and boundary

- `GENERATION_PROTOCOL_VERSION` **1 → 2**. `RequestGenerationMessage` gains
  `preferences: GenerationPreferences`, a sibling to `request`. `GenerationRequest`
  stays authored-text-only.
- The bump is a **lockstep cutover**: every generation message
  (`GET_PROVIDER_STATUS`, `RECORD_TRANSMISSION_CONSENT`, `TEST_PROVIDER`, port
  messages), every guard in `shared/protocol.ts`, and every popup-/options-side
  call site move to `v: 2` together. No mixed-version handling.
- **Validation** — `isGenerationPreferences` — runs in `background/generation.ts`
  at the message boundary. Absent / malformed / unknown-id `preferences` →
  new typed error kind **`invalid-preferences`**, no provider call, no silent
  default. (Storage reads in the popup still fall back to the default; a message
  boundary rejects.)
- **Mapping** — `preferencesToInstructions` — runs in `runGeneration`
  (`features/generation/generate.ts`), colocated with `buildGenerationInput`.
  `background/` stays thin: transport, sender auth, storage, validation.
- `TEST_PROVIDER` passes `DEFAULT_GENERATION_PREFERENCES` — still a minimal call,
  zero LinkedIn content.
- `GenerationError` / `GenerationErrorKind` gain `invalid-preferences`; the popup
  maps it to fixed copy. It is marked **retryable**: the popup's stored triple is
  always a valid typed value (validated on read, default fallback), so this only
  fires on transient protocol skew during an extension update, where a Retry
  after the reload works. ("Open settings" — the original plan — points at the
  wrong place, since tone/intent/length are popup controls, not options.)

### Prompt construction

- `buildGenerationInput(request, instructions: readonly string[])` — new second
  argument, supplied by `runGeneration`.
- The three instructions render into **`system`** as a mandatory bulleted list in
  `[intent, tone, length]` order (Intent first), under a lead-in such as
  *"Your reply must do all of the following:"*. No per-bullet labels in v1.
- The base `system` prompt is stripped of *"Write 2 to 4 sentences, warm but not
  effusive"*. It keeps the invariants: output only the reply (no preamble,
  quotes, sign-off), no hashtags, no emoji unless the source uses them, reply in
  the source's language.
- Authored text and the post-comment / comment-reply framing stay in **`user`**,
  unchanged.

### Instruction text (Phase 6 registry revision)

- **Length** — non-overlapping sentence ranges as imperatives, each with a
  density instruction. Approximate targets (final wording set during
  implementation, in this shape):
  - short — "Write 1 sentence. Make a single point and stop."
  - medium — "Write 2–3 sentences. Make one point and back it with a brief reason
    or example."
  - long — "Write 4–5 sentences in one paragraph. Develop the point with
    reasoning — still a comment, not an article."
  - `approxTarget` realigned to the same ranges.
  - Manual testing after the first cut (short 1–2 / medium 3–4 / long 5–7 + two
    paragraphs) showed Long far too long to read; the ladder was pulled down one
    step to the values above.
- **Tone / Intent** — sharpened to a concrete lever plus an explicit "don't",
  still terse imperatives, still free of LinkedIn/provider nouns. Direction (final
  wording set during implementation): professional = businesslike register, no
  slang/exclamation/emoji; friendly = warm conversational, contractions, not
  gushing; confident = clear stance, no hedging/qualifiers/apologies; thoughtful =
  reflective, acknowledge a trade-off, show reasoning. support = endorse + one
  specific reason, don't just agree; add-insight = add something new, don't
  restate; ask-question = exactly one specific genuine question; answer = answer
  directly in the first sentence; disagree = name the specific claim + reason,
  don't soften into agreement; congratulate = specific and sincere, not generic.
- The Phase 6 `MAX_INSTRUCTION_WORDS` test bound rises (25 → ~40). Banned-
  substring list unchanged. `preferencesToInstructions` contract unchanged
  (`[intent, tone, length]`, pure, no interaction-kind parameter).

### Provider request tuning

- `GenerateOptions` gains optional `temperature` and `maxTokens`.
- `temperature`: fixed **0.6**, set by `runGeneration`.
- `maxTokens`: derived from `preferences.length` in `runGeneration` (short ≈ 160,
  medium ≈ 320, long ≈ 640) — a cost / runaway backstop, **not** the length
  mechanism.
- `openai.ts` puts `temperature` and `max_tokens` in the request body. The
  `AIProvider` interface shape is unchanged; a future provider maps the same two
  options onto its own field names.
- Malformed-response policy unchanged; coverage widened: `choices: []`, missing /
  empty / whitespace `message.content`, HTTP-200 body shaped `{ error: {...} }`
  → `invalid-response`. `finish_reason: "length"` with non-empty content →
  `ok: true` (returned, not errored). No refusal detection.

### One draft

`GenerationResult` / `GenerationResultMessage` stay single-`text`. The
`AIProvider` contract returns one `text`. Regenerate is the "another one" path.

### Current-selection guarantee

- `usePreferences` gains a `ready` flag. `GenerationPanel` disables Generate and
  Regenerate until the stored value has hydrated.
- The in-memory hook state is the single source of truth within a popup session —
  updated synchronously on change, persisted best-effort. No storage read on the
  Generate path.
- `generate(request, prefs)` and Regenerate read the live state. The SW never
  caches preferences.
- Regenerate reuses the already-extracted `request`; only the preferences are
  re-read.
- A second `REQUEST_GENERATION` on a port with a generation already in flight is
  ignored.
- `retryAfterMs` countdown on the Retry button is **not** built in v1.

### Consent disclosure (ADR-0007)

One clause added: the disclosure states that the selected tone, intent and length
are sent along with the authored text. The transmitted-data list notes the id
triple explicitly carries no LinkedIn content and no PII.

## Testing Decisions

A good test asserts observable behaviour at a module's public surface — what a
caller passes and gets back, what lands in the outbound request, what renders —
never a private helper or call order. Automated tests prove **the instruction is
in the prompt and the knobs are set**, not that the model obeys (not
deterministically testable); model fidelity is the manual smoke test.

Deterministic provider = mocked `fetch` + the real `openaiProvider` (the existing
pattern in `background/generation.test.ts` and `openai.test.ts`). No fake-provider
abstraction.

Seams:

- **`preferences.ts`** (pure, existing) — revised Length instructions are
  non-overlapping and mutually distinct; revised tone/intent strings within the
  raised word bound, no banned substrings; `preferencesToInstructions` contract
  unchanged (all 72 combinations, `[intent, tone, length]`).
- **`prompt.ts` `buildGenerationInput(request, instructions)`** (pure) —
  instructions appear in `system` in array order under the mandatory lead-in;
  base prompt no longer contains "2 to 4 sentences" / "warm but not effusive";
  invariants present; `user` carries authored text + correct interaction framing;
  no PII; both interaction kinds.
- **`generate.ts` `runGeneration`** (real provider + mocked `fetch`) — selected
  instructions reach the outbound `messages[0].content`; `temperature: 0.6` and
  the length-derived `max_tokens` in the body; different prefs → different system
  content; different length → different `max_tokens`; unknown providerId →
  `provider-not-configured`.
- **`background/generation.ts`** (chrome + `fetch` mocks) — valid `preferences`
  proceeds and the outbound body reflects the triple; missing → `invalid-
  preferences`, no fetch; malformed (unknown id / extra key / non-object) →
  `invalid-preferences`; `preferences` values never reach `console.*`; a
  duplicate in-flight `REQUEST_GENERATION` is ignored; existing preflight tests
  updated to pass a valid `preferences`.
- **`protocol.ts`** — `GENERATION_PROTOCOL_VERSION === 2`; `isGenerationPort
  Message` requires `preferences` present on `REQUEST_GENERATION`; result / one-
  shot guards on `v: 2`.
- **`useGeneration` + `Popup`** (React Testing Library) — `generate` posts
  `{ v: 2, …, request, preferences }`; the `ready` gate disables Generate until
  hydrated and a stored non-default preference is what's sent on the earliest
  click; change Tone → Regenerate posts the new triple and opens a new port; the
  message carries no author names and no key.
- **`openai.ts`** — `temperature` + `max_tokens` in the body; expanded malformed
  matrix; `finish_reason: "length"` + non-empty → `ok: true`.
- **`security.bundle.test.ts`** — unchanged mechanism (imports the registry, so
  it auto-covers the revised strings); confirm green.

Prior art: `src/features/generation/generation.test.ts` (pure generation-layer
tests), `src/background/generation.test.ts` (SW orchestrator with mocked
`fetch`/chrome), `src/features/generation/providers/openai.test.ts` (provider with
mocked `fetch`), `src/popup/Popup.test.tsx` (RTL with a stubbed `chrome`).

Manual: `docs/testing/phase-7-manual-smoke-test.md`, per-phase convention
(phases 3–6) — every tone, every intent, Short/Medium/Long on the same post,
post-comment vs comment-reply, Regenerate, and the offline / 401 / 429 error
paths.

## Out of Scope

- Multiple / ranked suggestions; a suggestion picker.
- Editor insertion; automatic Post / Reply; any automatic engagement.
- New AI providers; Ollama / LM Studio / local runtimes.
- Personality learning; writing-style cloning; custom prompt fields; user-created
  tones or intents.
- Analytics; any account system.
- Per-interaction-type intent sets; an interaction-kind parameter to
  `preferencesToInstructions`.
- Per-bullet instruction labels (`Purpose:` / `Tone:` / `Length:`).
- A `retryAfterMs` countdown / auto-retry.
- Streaming responses.
- Word-count length targets.
- `chrome.storage.sync` for preferences.

## Further Notes

- Design rationale: `docs/adr/0010-wiring-preferences-into-generation.md`.
  ADR-0010 supersedes the "Phase 7 handoff" section of ADR-0009 and revises the
  instruction strings ADR-0009 introduced.
- The `answer` intent against a post with no question: the model does its best;
  no special handling — the user chose the intent.
- If Intent still reads weakly after implementation, the reserved follow-up is
  per-bullet labels (the array order is already a hard contract).
