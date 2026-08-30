import { SDUI_FEED_POST_ROOT_SELECTOR } from '../features/linkedin-context/postAdapter'

export const COMPOSER_ADAPTER_VERSION = 4 as const

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

// The SDUI feed comment composer has no stable wrapper class or data attribute:
// it is a tiptap textbox whose accessible label mentions "comment". Reply
// editors on the SDUI feed carry the *same* label, so they are told apart by
// document position (see `isSduiCommentComposer`).
const SDUI_COMMENT_EDITOR_SELECTOR =
  '[contenteditable="true"][role="textbox"][aria-label*="comment" i], .tiptap[contenteditable="true"][aria-label*="comment" i]'

function legacyCommentComposerRoot(editor: HTMLElement): HTMLElement | undefined {
  if (!editor.matches(LABELLED_EDITOR_SELECTOR) && !editor.closest(COMMENT_ROOT_SELECTORS.join(','))) return undefined
  const root = editor.closest<HTMLElement>(COMMENT_ROOT_SELECTORS.join(','))
  if (!root || root.matches(REPLY_ANCESTOR_SELECTOR) || root.closest(REPLY_ANCESTOR_SELECTOR)) return undefined
  const marker = `${root.getAttribute('aria-label') ?? ''} ${root.className}`.toLowerCase()
  return /reply|message|search|start a post/.test(marker) ? undefined : root
}

function sduiCommentComposerRoot(editor: HTMLElement): HTMLElement | undefined {
  if (!editor.matches(SDUI_COMMENT_EDITOR_SELECTOR)) return undefined
  const post = editor.closest<HTMLElement>(SDUI_FEED_POST_ROOT_SELECTOR)
  if (!post || !post.closest('main [data-testid="mainFeed"]')) return undefined
  if (editor.closest(REPLY_ANCESTOR_SELECTOR)) return undefined
  // The top-level comment composer is the first such editor in document order
  // within the post; anything after it is a reply composer.
  const firstCommentEditor = post.querySelector<HTMLElement>(SDUI_COMMENT_EDITOR_SELECTOR)
  return firstCommentEditor === editor ? post : undefined
}

export function findCommentComposerRoot(editor: HTMLElement): HTMLElement | undefined {
  return legacyCommentComposerRoot(editor) ?? sduiCommentComposerRoot(editor)
}

export function isEligibleCommentComposer(editor: HTMLElement): boolean {
  if (!editor.isConnected || !editor.matches(EDITOR_SELECTOR)) return false
  if (editor.closest('[data-modaicom-inline-wrapper]') || editor.closest(REPLY_ANCESTOR_SELECTOR)) return false
  const attrs = [editor.getAttribute('role'), editor.getAttribute('aria-label'), editor.getAttribute('placeholder')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (/search|start a post|message/.test(attrs) || /\breply\b/.test(attrs)) return false
  return Boolean(findCommentComposerRoot(editor))
}
