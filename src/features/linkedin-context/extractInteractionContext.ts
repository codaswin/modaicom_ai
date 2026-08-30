import {
  commentAuthorElement,
  commentBody,
  commentBodyIsCollapsed,
  isValidatedCommentRoot,
  normalizeCommentAuthor,
} from './commentAdapter'
import { extractPostContextInPage, normalizeLinkedInText } from './extractPostContext'
import { isInteractionExtractionResult, type CommentFailureKind, type ExtractedCommentContext, type InteractionExtractionResult } from './interactionContext'
import { REQUEST_PAGE_EXTRACTION } from '../../shared/protocol'

// The validated element handle(s) an Inline Trigger click passes to extraction.
export type ResolvedInteractionTarget =
  | { kind: 'post-comment'; postElement: Element }
  | { kind: 'comment-reply'; postElement: Element; commentElement: Element }

// Chrome inside a comment body that is never authored text (@mention and
// #hashtag links are <a>, not buttons, so they survive).
const COMMENT_BODY_CHROME_SELECTOR =
  '.comments-comment-item__inline-show-more-text, .feed-shared-inline-show-more-text button, button, [role="button"]'

function extractCommentContext(
  commentElement: Element,
): { context: ExtractedCommentContext } | { failure: CommentFailureKind } {
  if (!commentElement.isConnected || !isValidatedCommentRoot(commentElement)) {
    return { failure: 'comment-not-found' }
  }
  const body = commentBody(commentElement)
  if (!body) return { failure: 'comment-no-text' }
  if (commentBodyIsCollapsed(body)) return { failure: 'comment-collapsed' }

  const authoredText = normalizeLinkedInText(body, COMMENT_BODY_CHROME_SELECTOR)
  if (!authoredText) return { failure: 'comment-no-text' }

  const authorElement = commentAuthorElement(commentElement)
  const authorDisplayName = authorElement ? normalizeCommentAuthor(authorElement.textContent ?? '') : ''
  if (!authorDisplayName) return { failure: 'comment-author-not-found' }

  return { context: { authorDisplayName, authoredText } }
}

export function extractInteractionContextInPage(
  target: ResolvedInteractionTarget,
  currentUrl: string = location.href,
): InteractionExtractionResult {
  const postResult = extractPostContextInPage(target.postElement, currentUrl)
  if (postResult.kind !== 'success') return { kind: postResult.kind }

  if (target.kind === 'post-comment') {
    return { kind: 'success', context: { kind: 'post-comment', post: postResult.context } }
  }

  const comment = extractCommentContext(target.commentElement)
  if ('failure' in comment) return { kind: comment.failure }
  return {
    kind: 'success',
    context: { kind: 'comment-reply', post: postResult.context, targetComment: comment.context },
  }
}

// The popup's on-demand individual-post fallback: ask the persistent content
// script to run the extractor in the page (its module scope is intact) and
// return the typed Interaction Context.
export async function requestPageInteractionContext(): Promise<InteractionExtractionResult> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!activeTab?.id) return { kind: 'unexpected-error' }
    const runtimeResult: unknown = await chrome.tabs.sendMessage(activeTab.id, REQUEST_PAGE_EXTRACTION)
    return isInteractionExtractionResult(runtimeResult) ? runtimeResult : { kind: 'unexpected-error' }
  } catch {
    return { kind: 'unexpected-error' }
  }
}
