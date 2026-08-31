import type { GenerationRequest } from './generationRequest'
import type { GenerationInput } from './types'

// Invariant rules only (ADR-0010). Length and tone come from the caller's
// `instructions` — the Phase 5 prompt baked in "2 to 4 sentences, warm but not
// effusive", which fights the Response Controls once they are wired in.
const BASE_SYSTEM_PROMPT =
  'You draft a single reply for a professional LinkedIn conversation. ' +
  'Reply in the same language as the text you are given. ' +
  'No hashtags. No emoji unless the source text uses them. ' +
  'Output only the reply text: no preamble, no quotation marks, no sign-off.'

// `instructions` is the ordered [intent, tone, length] array from
// `preferencesToInstructions`. Rendered as a mandatory list — Intent first,
// because it is the anchor. `buildGenerationInput` does not need to know which
// entry is which; each instruction stands alone.
export function buildGenerationInput(
  request: GenerationRequest,
  instructions: readonly string[],
): GenerationInput {
  const system =
    instructions.length > 0
      ? `${BASE_SYSTEM_PROMPT}\n\nYour reply must do all of the following:\n` +
        instructions.map((line) => `- ${line}`).join('\n')
      : BASE_SYSTEM_PROMPT

  const parts = [`The LinkedIn post reads:\n\n${request.postText.trim()}`]
  if (request.interactionKind === 'comment-reply') {
    parts.push(
      `Someone commented on that post:\n\n${request.commentText.trim()}\n\nDraft a reply addressed to that comment.`,
    )
  } else {
    parts.push('Draft a top-level comment responding to the post.')
  }
  return { system, user: parts.join('\n\n') }
}
