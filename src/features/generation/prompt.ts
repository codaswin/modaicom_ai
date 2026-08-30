import type { GenerationRequest } from './generationRequest'
import type { GenerationInput } from './types'

// Phase 5 has one fixed prompt — no tone / intent / length / personality
// controls (those are explicitly out of scope). A later phase widens this.
const SYSTEM_PROMPT =
  'You draft a short reply for a professional LinkedIn conversation. ' +
  'Write 2 to 4 sentences, warm but not effusive. No hashtags. No emoji unless the source text uses them. ' +
  'Output only the reply text: no preamble, no quotation marks, no sign-off.'

export function buildGenerationInput(request: GenerationRequest): GenerationInput {
  const parts = [`The LinkedIn post reads:\n\n${request.postText.trim()}`]
  if (request.interactionKind === 'comment-reply') {
    parts.push(
      `Someone commented on that post:\n\n${request.commentText.trim()}\n\nDraft a reply addressed to that comment.`,
    )
  } else {
    parts.push('Draft a top-level comment responding to the post.')
  }
  return { system: SYSTEM_PROMPT, user: parts.join('\n\n') }
}
