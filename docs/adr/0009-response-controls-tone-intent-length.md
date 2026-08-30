# Response controls: typed Tone, Intent and Length

Status: accepted on 2026-08-31 (grill-with-docs). Builds on ADR-0007 and ADR-0008.

Phase 6 gives the user three deliberate controls over a draft — **Tone** (how it
sounds), **Intent** (what the comment is for), and **Length** (how long) — without
a free-text prompt field, custom tones, or personality learning. This ADR records
where each part lives and why.

## One module owns the vocabulary and the mapping

`src/features/generation/preferences.ts` holds three `const` registries —
`TONES` (4 rows), `INTENTS` (6 rows), `LENGTHS` (3 rows) — each row
`{ id, label, instruction }` (`LENGTHS` rows also carry an approximate
sentence-count target used later by Phase 7, kept as a separate field). Types are
derived, not declared: `type Tone = (typeof TONES)[number]['id']`, and likewise
for `Intent` and `ResponseLength`. `GenerationPreferences = { tone; intent; length }`.
No enums, consistent with the rest of the codebase.

- **`id` is the only value that is stored, validated, or mapped.** `label` is
  presentation-only; `instruction` is consumed only inside the generation layer.
- **`preferencesToInstructions(prefs: GenerationPreferences): readonly string[]`**
  lives in this same module. It is a pure function of `GenerationPreferences`
  alone — no interaction kind, no post text, no provider id — and returns exactly
  three strings in the order `[intent, tone, length]` ("what to say", then "how it
  sounds", then "how long"), each looked up by `id` from its registry.
- The four v1 tones are `professional`, `friendly`, `confident`, `thoughtful`.
  The six v1 intents are `support`, `add-insight`, `ask-question`, `answer`,
  `disagree`, `congratulate`. The three lengths are `short`, `medium`, `long`.
  One universal intent set serves both `post-comment` and `comment-reply` in v1.

## What Phase 6 deliberately does not touch

- **The `REQUEST_GENERATION` message and `buildGenerationInput` are unchanged.**
  Preferences stay popup-side in Phase 6: read on mount, written on change,
  rendered as UI. Phase 7 is what bumps `GENERATION_PROTOCOL_VERSION` to 2, adds
  `preferences: GenerationPreferences` to the request message, and decides how the
  instruction array is rendered into the `{ system, user }` Generation Input.
- **The LinkedIn DOM adapter never learns these words.** Tone / Intent / Length
  carry no LinkedIn content and are computed with no reference to extracted text.
- **The provider layer never learns these words.** Instruction strings are
  provider-neutral prose (no provider or model nouns); a test asserts the
  content-script bundle contains none of them.

## Boundaries and validation

- `isTone` / `isIntent` / `isResponseLength` are `id`-membership guards.
  `isGenerationPreferences` is strict: an object with **exactly** the three keys,
  each a known `id` — extra keys are rejected, matching `isGenerationRequest`.
- **Storage read falls back; a message boundary rejects.** `readPreferences()`
  from `chrome.storage.local` returns `DEFAULT_GENERATION_PREFERENCES` on any
  invalid or absent value — a corrupt local value is a bug or a migration, not an
  attack, and the fallback guarantees `preferencesToInstructions` never sees an
  unknown `id`. When Phase 7 puts `preferences` on the wire, an invalid value must
  produce a typed error (a new `invalid-preferences` **Generation Error** kind),
  never a silent default — "never trust arbitrary strings arriving through runtime
  messages."
- **Persistence**: `chrome.storage.local` key `modaicom.generation.preferences`,
  the `id` triple only. Not `chrome.storage.sync` (no reason to replicate a UI
  preference to Google), not session-only, not reset on popup close.
- **Default**: `DEFAULT_GENERATION_PREFERENCES =
  { tone: 'professional', intent: 'add-insight', length: 'medium' }`. The controls
  are never in a blank / unselected state; the user is never forced to choose
  before generating.
- Instruction strings are **never persisted and never messaged** — they exist only
  in the module and in whatever Phase 7 builds from the array.

## UI

Three native `<select>` controls in one `<fieldset>` with a `<legend>`
("Response controls"), each with a visible `<label>`, options mapped from the
registries by `id`, placed above the Generate button in the action popup. Length
carries the single qualitative caption from the grill ("Short = a quick reply ·
Medium = a substantive comment · Long = a developed point") wired via
`aria-describedby`; no word counts or per-option numbers. A one-line hint under
the group notes the controls guide the draft and the user can still edit it.
Native `<select>` gives keyboard navigation, type-ahead, focus and selected
states, and screen-reader semantics with no custom code, and its current value is
text rather than colour. A custom segmented control is deferred until the platform
control proves too hidden.

## Logging

No change to the logging policy. Tone / Intent / Length `id`s are not secret, but
there is no reason to log them; extracted LinkedIn content, API keys, and
generated drafts remain unlogged (ADR-0007, ADR-0008).
