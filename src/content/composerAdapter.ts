import {
  LEGACY_COMMENT_ROOT_SELECTOR,
  SDUI_COMMENT_MARKER_SELECTOR,
  commentMarkupRegime,
  isValidatedCommentRoot,
  legacyCommentRoot,
} from '../features/linkedin-context/commentAdapter'
import { SDUI_FEED_POST_ROOT_SELECTOR } from '../features/linkedin-context/postAdapter'
import type { InteractionKind } from '../features/linkedin-context/interactionContext'

// v5: `classifyComposer` distinguishes top-level comment composers from reply
// composers (Phase 4). Reply composers are recognised in the `legacy` Markup
// Regime only; see ADR-0006.
export const COMPOSER_ADAPTER_VERSION = 5 as const

export const EDITOR_SELECTOR = 'textarea, [contenteditable="true"]'
const COMMENT_ROOT_SELECTORS = [
  '[data-testid="comment-composer"]',
  '[data-test-id="comment-composer"]',
  '[data-testid="comment-box"]',
  '[data-test-id="comment-box"]',
  '[data-view-name="comment-box"]',
  '.comments-comment-box',
  '.comments-comment-texteditor',
  '.comments-comment-box__form-container',
]
const REPLY_ANCESTOR_SELECTOR =
  '[data-testid*="reply" i], [data-test-id*="reply" i], [data-view-name*="reply" i], [aria-label*="reply" i], [class*="reply" i]'
const LABELLED_EDITOR_SELECTOR = [
  '[contenteditable="true"][aria-label="Comment" i]',
  '[contenteditable="true"][aria-label*="Add a comment" i]',
  '[contenteditable="true"][aria-label*="comment" i]',
  '[contenteditable="true"][aria-placeholder*="comment" i]',
  '[contenteditable="true"][data-placeholder*="comment" i]',
].join(',')

// Legacy reply composer: the accessible label / placeholder mentions "reply".
const LEGACY_REPLY_EDITOR_SELECTOR = [
  '[contenteditable="true"][aria-placeholder*="reply" i]',
  '[contenteditable="true"][data-placeholder*="reply" i]',
  '[contenteditable="true"][aria-label*="reply" i]',
  'textarea[placeholder*="reply" i]',
].join(',')

// The SDUI feed comment composer has no stable wrapper class or data attribute:
// it is a tiptap textbox whose accessible label mentions "comment". Reply
// editors on the SDUI feed carry the *same* label.
const SDUI_COMMENT_EDITOR_SELECTOR =
  '[contenteditable="true"][role="textbox"][aria-label*="comment" i], .tiptap[contenteditable="true"][aria-label*="comment" i]'

function legacyCommentComposerRoot(editor: HTMLElement): HTMLElement | undefined {
  if (!editor.matches(LABELLED_EDITOR_SELECTOR) && !editor.closest(COMMENT_ROOT_SELECTORS.join(','))) return undefined
  const root = editor.closest<HTMLElement>(COMMENT_ROOT_SELECTORS.join(','))
  if (!root || root.matches(REPLY_ANCESTOR_SELECTOR) || root.closest(REPLY_ANCESTOR_SELECTOR)) return undefined
  const marker = `${root.getAttribute('aria-label') ?? ''} ${root.className}`.toLowerCase()
  return /reply|message|search|start a post/.test(marker) ? undefined : root
}

// T4: on `sdui`, an editor is a top-level comment composer only when no
// `urn:li:comment:` element precedes it in document order within its post —
// otherwise it is a reply composer (or below the comment list) and gets no
// trigger. Suppression is fail-safe: a false positive means a real top composer
// is skipped, never a wrong extraction.
function sduiCommentUrnPrecedes(editor: Element, post: Element): boolean {
  const marker = post.querySelector(SDUI_COMMENT_MARKER_SELECTOR)
  if (!marker) return false
  return Boolean(editor.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_PRECEDING)
}

function sduiCommentComposerRoot(editor: HTMLElement): HTMLElement | undefined {
  if (!editor.matches(SDUI_COMMENT_EDITOR_SELECTOR)) return undefined
  const post = editor.closest<HTMLElement>(SDUI_FEED_POST_ROOT_SELECTOR)
  if (!post || !post.closest('main [data-testid="mainFeed"]')) return undefined
  if (editor.closest(REPLY_ANCESTOR_SELECTOR)) return undefined
  if (sduiCommentUrnPrecedes(editor, post)) return undefined
  const firstCommentEditor = post.querySelector<HTMLElement>(SDUI_COMMENT_EDITOR_SELECTOR)
  return firstCommentEditor === editor ? post : undefined
}

export function findCommentComposerRoot(editor: HTMLElement): HTMLElement | undefined {
  return legacyCommentComposerRoot(editor) ?? sduiCommentComposerRoot(editor)
}

function hasBlockedAttrs(editor: HTMLElement): boolean {
  const attrs = [editor.getAttribute('role'), editor.getAttribute('aria-label'), editor.getAttribute('placeholder')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return /search|start a post|message/.test(attrs)
}

// Phase 3 predicate: true only for a top-level comment composer.
export function isEligibleCommentComposer(editor: HTMLElement): boolean {
  if (!editor.isConnected || !editor.matches(EDITOR_SELECTOR)) return false
  if (editor.closest('[data-modaicom-inline-wrapper]') || editor.closest(REPLY_ANCESTOR_SELECTOR)) return false
  if (hasBlockedAttrs(editor)) return false
  const attrs = `${editor.getAttribute('aria-label') ?? ''} ${editor.getAttribute('placeholder') ?? ''}`.toLowerCase()
  if (/\breply\b/.test(attrs)) return false
  return Boolean(findCommentComposerRoot(editor))
}

// Regime-agnostic "this editor is a reply composer" hint, for diagnostics only.
export function looksLikeReplyComposer(editor: HTMLElement): boolean {
  return editor.isConnected && editor.matches(EDITOR_SELECTOR) && editor.matches(LEGACY_REPLY_EDITOR_SELECTOR)
}

function isLegacyReplyComposer(editor: HTMLElement): boolean {
  if (!editor.matches(LEGACY_REPLY_EDITOR_SELECTOR)) return false
  const comment = legacyCommentRoot(editor)
  return Boolean(comment && isValidatedCommentRoot(comment))
}

// Phase 4: classify an editor as the target of a Post-Comment interaction, a
// Comment-Reply interaction, or neither.
export function classifyComposer(editor: HTMLElement): InteractionKind | null {
  if (!editor.isConnected || !editor.matches(EDITOR_SELECTOR)) return null
  if (editor.closest('[data-modaicom-inline-wrapper]')) return null
  if (hasBlockedAttrs(editor)) return null
  if (isLegacyReplyComposer(editor)) return 'comment-reply'
  if (isEligibleCommentComposer(editor)) return 'post-comment'
  return null
}

export { LEGACY_COMMENT_ROOT_SELECTOR, commentMarkupRegime }
