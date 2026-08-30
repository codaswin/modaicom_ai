import { isExtractedPostContext, type ExtractedPostContext, type PostExtractionResult } from './extractPostContext'

// Phase 4: the discriminated read-only payload an Inline Targeting Session
// produces. A Post-Comment Interaction carries the Owning Post context; a
// Comment-Reply Interaction additionally carries one Target Comment.

export type ExtractedCommentContext = {
  authorDisplayName: string
  authoredText: string
}

export type LinkedInInteractionContext =
  | { kind: 'post-comment'; post: ExtractedPostContext }
  | { kind: 'comment-reply'; post: ExtractedPostContext; targetComment: ExtractedCommentContext }

export type InteractionKind = LinkedInInteractionContext['kind']

// Comment-half failures. A Comment-Reply Interaction is all-or-nothing: any of
// these fails the whole interaction rather than downgrading to a Post-Comment
// result.
export type CommentFailureKind =
  | 'comment-not-found'
  | 'comment-author-not-found'
  | 'comment-no-text'
  | 'comment-collapsed'
  | 'comment-stale-target'
  | 'ambiguous-target-comment'

export type PostFailureKind = Exclude<PostExtractionResult['kind'], 'success'>

export type InteractionExtractionResult =
  | { kind: 'success'; context: LinkedInInteractionContext }
  | { kind: PostFailureKind }
  | { kind: CommentFailureKind }

export const COMMENT_FAILURE_KINDS: readonly CommentFailureKind[] = [
  'comment-not-found',
  'comment-author-not-found',
  'comment-no-text',
  'comment-collapsed',
  'comment-stale-target',
  'ambiguous-target-comment',
]

const POST_FAILURE_KINDS: readonly PostFailureKind[] = [
  'unsupported-surface',
  'post-not-found',
  'ambiguous-post',
  'collapsed-post',
  'no-text',
  'author-not-found',
  'unexpected-error',
  'cancelled',
  'stale-target',
  'no-candidates',
  'ambiguous-candidates',
  'selection-failure',
]

const FAILURE_KINDS = new Set<string>([...POST_FAILURE_KINDS, ...COMMENT_FAILURE_KINDS])

function isExtractedCommentContext(value: unknown): value is ExtractedCommentContext {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.authorDisplayName === 'string' &&
    candidate.authorDisplayName.trim().length > 0 &&
    typeof candidate.authoredText === 'string' &&
    candidate.authoredText.trim().length > 0
  )
}

export function isLinkedInInteractionContext(value: unknown): value is LinkedInInteractionContext {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (!isExtractedPostContext(candidate.post)) return false
  if (candidate.kind === 'post-comment') return true
  if (candidate.kind === 'comment-reply') return isExtractedCommentContext(candidate.targetComment)
  return false
}

export function isInteractionExtractionResult(value: unknown): value is InteractionExtractionResult {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.kind === 'success') return isLinkedInInteractionContext(candidate.context)
  return typeof candidate.kind === 'string' && FAILURE_KINDS.has(candidate.kind)
}

// A post-extraction outcome, wrapped as a Post-Comment interaction result.
export function postExtractionToInteractionResult(result: PostExtractionResult): InteractionExtractionResult {
  if (result.kind === 'success') {
    return { kind: 'success', context: { kind: 'post-comment', post: result.context } }
  }
  return { kind: result.kind }
}
