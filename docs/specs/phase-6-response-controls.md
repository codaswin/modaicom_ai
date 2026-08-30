# Phase 6 — Response Controls: Tone, Intent and Length

Status: Specified on 2026-08-31 (grill-with-docs → to-spec). Builds on ADR-0007,
ADR-0008, and ADR-0009.

## Problem Statement

modaicom produces exactly one Generated Draft in a single fixed voice. When a user
is about to comment on LinkedIn they have no way to say "make this a short, warm
question" versus "a longer, confident counterpoint." The draft frequently lands in
the wrong register for the moment, so the user rewrites it — which is the effort
modaicom exists to remove.

## Solution

Before generating, the user gets three quick, deliberate controls in the action
popup:

- **Tone** — how the reply sounds: Professional, Friendly, Confident, Thoughtful.
- **Intent** — what the reply is for: Support, Add insight, Ask a question,
  Answer, Disagree, Congratulate.
- **Length** — roughly how long: Short, Medium, Long.

The set is fixed and curated: no free-text prompt box, no user-created tones or
intents, no personality learning, no writing-style cloning. A sensible default is
always selected, so a user who never touches the controls still gets a draft. The
last-used selection is remembered between popup sessions.

Phase 6 delivers the vocabulary, the runtime validation, the persistence, the
popup UI, and a pure function that turns a selection into an ordered list of
provider-neutral instruction strings. **Feeding those instructions into an actual
generation request is Phase 7** — Phase 6 does not touch the `REQUEST_GENERATION`
message or the prompt builder.

## User Stories

1. As a LinkedIn commenter, I want to pick a tone for my draft, so that it matches
   how I want to come across in that thread.
2. As a LinkedIn commenter, I want to pick what my comment is for (support, a
   question, a counterpoint…), so that the draft actually does that job instead of
   a generic reply.
3. As a LinkedIn commenter, I want to pick roughly how long the draft should be,
   so that I get a one-liner when I want a one-liner and a developed point when I
   want that.
4. As a user in a hurry, I want the controls to already have a reasonable default
   selected, so that I can just hit Generate without configuring anything.
5. As a returning user, I want my last tone/intent/length choice to still be
   selected when I reopen the popup, so that I am not re-picking the same thing
   every time.
6. As a user who changed my mind, I want to change any one control without
   disturbing the other two, so that adjusting the tone does not reset my intent.
7. As a keyboard user, I want to reach and change every control with Tab and arrow
   keys, so that I never need the mouse.
8. As a screen-reader user, I want each control announced with a clear label and
   its current value, and the group announced as a group, so that I know what I am
   changing.
9. As a low-vision user, I want the selected option conveyed by text, not only
   colour, so that I can tell what is chosen.
10. As a user glancing at the popup, I want a one-line hint that these controls
    guide the draft and I can still edit it, so that I understand what they do
    without a manual.
11. As a user picking a length, I want a short qualitative description of what
    Short / Medium / Long mean, so that I am not guessing, without being shown
    word counts I would have to interpret.
12. As a user replying to a comment rather than commenting on a post, I want the
    same intent choices to be available, so that the controls behave consistently
    regardless of what I am responding to.
13. As a user, I want unfamiliar or corrupted stored preferences to quietly reset
    to the default, so that a bad stored value never breaks the popup or produces
    a nonsense instruction.
14. As a security-conscious user, I want my tone/intent/length choices to carry no
    LinkedIn content and never be logged, so that this feature does not widen what
    modaicom knows or records.
15. As a maintainer, I want the LinkedIn DOM adapter to have no knowledge of tone,
    intent, or length, so that the extraction layer stays a pure content adapter.
16. As a maintainer, I want the AI provider layer to have no knowledge of
    modaicom's tone/intent/length vocabulary, so that providers stay
    interchangeable.
17. As a maintainer, I want tone/intent/length to be string-literal unions derived
    from `const` registries, matching the rest of the codebase, so that there are
    no enums and the types cannot drift from the data.
18. As a maintainer, I want the only value that is stored, validated, messaged, or
    mapped to be the option `id`, with labels and instruction text kept
    presentation-/generation-internal, so that renaming a label is not a data
    migration.
19. As a maintainer, I want a strict runtime guard for a preferences object that
    rejects unknown ids and extra keys, so that a hand-crafted value cannot slip
    through when Phase 7 puts preferences on the wire.
20. As a maintainer, I want the instruction mapping to be one pure function of the
    preferences object with a stable output order, so that it is trivial to test
    and reason about.
21. As a Phase 7 implementer, I want Phase 6 to hand me a ready validation guard
    and a ready instruction-list function without having pre-decided how the list
    renders into a prompt, so that I own the prompt assembly.
22. As a user, I want the controls to sit above the Generate button in a compact
    block, so that the popup does not turn into a settings screen.

## Implementation Decisions

### Ownership and boundaries

- Phase 6 introduces a new module in the generation feature that owns: the
  vocabulary (three registries), the derived types, the runtime guards, the
  default, and the pure `preferencesToInstructions` mapping. A separate
  popup-side module owns persistence. The popup renders the UI.
- Phase 6 makes **no change** to the runtime message protocol
  (`src/shared/protocol.ts`), to the `REQUEST_GENERATION` message, or to the
  prompt/generation-input builder. Preferences stay popup-side this phase.
- The LinkedIn DOM adapter and the `AIProvider` implementations gain no knowledge
  of Tone / Intent / Length. Instruction strings contain no LinkedIn or provider
  nouns.
- Terminology is recorded in `CONTEXT.md` (Response Controls, Tone, Intent,
  Response Length, Generation Preferences, Preference Instructions) and the design
  in ADR-0009.

### Vocabulary — three `const` registries

Each registry is a `const` array of rows `{ id, label, instruction }`. The Length
rows additionally carry an approximate sentence-count target string, kept as a
separate field, unused by Phase 6 UI and reserved for Phase 7 prompt assembly.
Types are derived, e.g. `type Tone = (typeof TONES)[number]['id']`. No enums.

**Tone** (`Tone`) — how the draft sounds:

| id | label | instruction |
|---|---|---|
| `professional` | Professional | Write in a professional, polished tone. Avoid slang and exclamation marks. |
| `friendly` | Friendly | Write in a warm, approachable tone. Be personable without being casual or effusive. |
| `confident` | Confident | Write in a direct, assured tone. State the point plainly, without hedging or filler qualifiers. |
| `thoughtful` | Thoughtful | Write in a measured, reflective tone. Acknowledge nuance and show considered reasoning. |

**Intent** (`Intent`) — what the comment is for. One universal set, identical for
a Post-Comment Interaction and a Comment-Reply Interaction in v1:

| id | label | instruction |
|---|---|---|
| `support` | Support | Agree with and reinforce the author's point, adding a brief reason or example. |
| `add-insight` | Add insight | Contribute one additional perspective or fact that builds on the post rather than restating it. |
| `ask-question` | Ask a question | Ask one genuine, specific question that invites the author to expand on their point. |
| `answer` | Answer | Directly and concisely answer the question raised in what you are responding to. |
| `disagree` | Disagree | Respectfully offer a different view, naming the specific point of disagreement and why. |
| `congratulate` | Congratulate | Give a brief, sincere note of congratulations suited to the achievement described. |

**Response Length** (`ResponseLength`) — roughly how long:

| id | label | instruction | approx target (Phase 7) |
|---|---|---|---|
| `short` | Short | Keep the response to roughly one or two sentences. | ~1–2 sentences |
| `medium` | Medium | Keep the response to roughly two to four sentences. | ~2–4 sentences |
| `long` | Long | Keep the response to roughly four to six sentences; still a comment, not an essay. | ~4–6 sentences; still a comment |

### The preferences object

- `GenerationPreferences = { tone: Tone; intent: Intent; length: ResponseLength }`.
- `DEFAULT_GENERATION_PREFERENCES = { tone: 'professional', intent: 'add-insight',
  length: 'medium' }`. A control is never in a blank / unselected state and the
  user is never forced to choose before generating.

### Validation

- `isTone`, `isIntent`, `isResponseLength`: `id`-membership guards over the
  registries.
- `isGenerationPreferences(value): value is GenerationPreferences`: **strict** —
  the value is a non-null object with **exactly** the keys `tone`, `intent`,
  `length`, each passing its `id` guard. Extra keys are rejected. This mirrors the
  strictness of the existing `isGenerationRequest` guard.
- **Storage read falls back; a message boundary rejects.** `readPreferences()`
  returns `DEFAULT_GENERATION_PREFERENCES` for any absent, malformed, partial, or
  unknown-id stored value, and never throws — a corrupt local value is a bug or a
  version migration, not an attack, and the fallback guarantees
  `preferencesToInstructions` never receives an unknown id. When Phase 7 places
  `preferences` on a runtime message, an invalid value must produce a typed error
  (a new `invalid-preferences` Generation Error kind), not a silent default.
  Phase 6 ships the guard that Phase 7 will call; Phase 6 does not add the error
  kind or the message field.

### Persistence

- `chrome.storage.local`, key `modaicom.generation.preferences`, storing the `id`
  triple only. **Not** `chrome.storage.sync` (no reason to replicate a UI
  preference to Google infrastructure); not session-only; not reset on popup
  close.
- A small popup-side store module exposes `readPreferences()` (validate → fall
  back to default) and `writePreferences(prefs)` (persist the id triple only).
- The popup reads on mount and writes on every change.

### Instruction mapping

- `preferencesToInstructions(prefs: GenerationPreferences): readonly string[]`,
  in the same module as the registries.
- Pure: a function of `GenerationPreferences` alone — no interaction kind, no post
  or comment text, no provider id.
- Returns **exactly three** strings in the fixed order
  `[intentInstruction, toneInstruction, lengthInstruction]` — "what to say", then
  "how it sounds", then "how long" — each looked up by `id` from its registry.
- The array is never persisted, never messaged, never sent to the LinkedIn page.
  How it renders into a Generation Input is a Phase 7 decision.

### UI

- Three native `<select>` controls inside one `<fieldset>` with a `<legend>`
  ("Response controls"), each with a visible `<label>`. Options are produced by
  mapping the registries (`<option value={row.id}>{row.label}</option>`), so the
  registry stays the single source.
- Placed above the Generate button in the action popup.
- The Length control carries a single qualitative caption ("Short = a quick
  reply · Medium = a substantive comment · Long = a developed point"), wired via
  `aria-describedby`. No word counts, no per-option numbers.
- One line under the group notes the controls guide the draft and the user can
  still edit it.
- Accessibility comes from the platform control: keyboard navigation, type-ahead,
  focus and selected states, and screen-reader combobox semantics with no custom
  `role` or key handler. The current value is text, not colour. A custom
  segmented control is explicitly deferred.
- The controls are always enabled and always have a value selected; there is no
  disabled or empty state to design.

## Testing Decisions

A good test here asserts **observable behaviour at a module's public surface** —
what a caller passes in and gets back, what renders, what is persisted — never a
private helper or an internal call sequence. Four seams, three of them existing:

### Seam 1 — the preferences module public surface (pure)

Prior art: `src/features/generation/generation.test.ts`, which tests `types.ts`,
`generationRequest.ts`, and `prompt.ts` by calling their exports with no `chrome`
and no DOM. Same shape here. Covers:

- **Registry integrity**: every row across the three registries has a unique,
  non-empty `id`, `label`, and `instruction`; each `instruction` is within a
  length bound and contains none of a banned-substring list (`openai`, `gpt`,
  `claude`, `linkedin`, `http`, `api key`) — the "no provider-specific / no
  LinkedIn leakage" rule as an executable assertion.
- **Guards accept** every valid `id` (table-driven over all 4 + 6 + 3).
- **Guards reject**: unknown id, wrong type (`number`, `null`, `undefined`,
  array); `isGenerationPreferences` additionally rejects a missing key, an extra
  key, a nested wrong type, and a non-object.
- **Default**: `DEFAULT_GENERATION_PREFERENCES` passes `isGenerationPreferences`
  and each of its three ids exists in its registry.
- **`preferencesToInstructions`**: returns exactly three non-empty strings; order
  is `[intent, tone, length]`; each equals the matching registry row's
  `instruction`; **all 72** tone×intent×length combinations produce three defined
  strings (no lookup miss).
- **Interaction-type independence**: the function's signature takes only
  `GenerationPreferences`; one explicit test documents that the same preferences
  yield the same instructions regardless of interaction kind (there is no
  interaction-kind parameter).

### Seam 2 — the popup preferences store

Prior art: the `chrome` stub pattern in `Popup.test.tsx` / `Options.test.tsx`;
`keyStore.ts` is the structural sibling. With `chrome.storage.local` stubbed:

- Round-trips a valid triple (serialize → deserialize).
- `readPreferences()` with nothing stored → `DEFAULT_GENERATION_PREFERENCES`.
- `readPreferences()` with a corrupt / partial / unknown-id stored value →
  `DEFAULT_GENERATION_PREFERENCES`, without throwing.
- `writePreferences()` persists an object with exactly `{ tone, intent, length }`
  and nothing else.

### Seam 3 — the Response Controls UI (via `Popup.test.tsx`)

Existing file. Covers:

- The three selects render with their labels; each lists exactly its registry's
  options.
- Changing one select calls `writePreferences` with the new id and leaves the
  other two values unchanged.
- On mount with a stored value the selects show it; with nothing stored they show
  the defaults.
- `fieldset` / `legend` present; the Length select is `aria-describedby` its
  caption.

### Seam 4 — `src/security.bundle.test.ts` (existing, one added assertion)

The built content-script bundle contains none of the Tone / Intent / Length
instruction strings.

A `docs/testing/phase-6-manual-smoke-test.md` following the per-phase convention
of phases 3–5 (render / default / isolation / persistence / keyboard / boundary
checklist). The behaviour is otherwise fully unit-covered.

## Out of Scope

- Any actual AI suggestion-generation workflow using the preferences — that is
  Phase 7 (rendering `preferencesToInstructions` output into `buildGenerationInput`,
  bumping `GENERATION_PROTOCOL_VERSION`, adding `preferences` to
  `REQUEST_GENERATION`, adding the `invalid-preferences` error kind).
- Multiple generated suggestions; a regenerate button; editor insertion;
  automatic Post / Reply; any automatic engagement.
- New AI providers; Ollama / LM Studio / local runtimes.
- Personality learning; writing-style cloning; custom free-text prompt fields;
  user-created tones; user-created intents.
- Per-interaction-type intent sets (one universal set in v1); an interaction-kind
  parameter to `preferencesToInstructions`.
- Analytics; any account system.
- Word-count length targets shown in the UI; a large settings interface; a custom
  segmented-control widget.
- `chrome.storage.sync` for preferences.

## Further Notes

- Design rationale and the boundary decisions are in
  `docs/adr/0009-response-controls-tone-intent-length.md`.
- Phase 7 handoff: Phase 6 hands Phase 7 (a) `isGenerationPreferences` for the
  message boundary and (b) `preferencesToInstructions` for prompt assembly, with
  no pre-decision on how the instruction array is joined, ordered relative to the
  post/comment text, or split between the `system` and `user` strings.
- The `answer` and `ask-question` intents are the only pair at risk of collision;
  their instruction wording keeps them distinct (respond to a question vs. raise
  one).
