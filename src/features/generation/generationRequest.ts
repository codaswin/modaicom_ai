import type { LinkedInInteractionContext } from '../linkedin-context/interactionContext'

// The minimised payload permitted to leave the device (ADR-0007): authored text
// and the interaction kind, nothing else.
export type GenerationRequest =
  | { interactionKind: 'post-comment'; postText: string }
  | { interactionKind: 'comment-reply'; postText: string; commentText: string }

// Minimise a LinkedIn Interaction Context. Author display names, headline,
// stable identifier, publication-time label, URLs, DOM and editor content are
// dropped here and never travel further.
export function contextToGenerationRequest(context: LinkedInInteractionContext): GenerationRequest {
  const postText = context.post.originalAuthoredText
  if (context.kind === 'comment-reply') {
    return { interactionKind: 'comment-reply', postText, commentText: context.targetComment.authoredText }
  }
  return { interactionKind: 'post-comment', postText }
}

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

// Strict: the exact key set only. Extra keys (a leaked author name, an identifier)
// are rejected, not stripped.
export function isGenerationRequest(value: unknown): value is GenerationRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (!nonEmptyString(candidate.postText)) return false
  if (candidate.interactionKind === 'post-comment') {
    return Object.keys(candidate).length === 2
  }
  if (candidate.interactionKind === 'comment-reply') {
    return nonEmptyString(candidate.commentText) && Object.keys(candidate).length === 3
  }
  return false
}
