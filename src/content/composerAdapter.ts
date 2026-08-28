export const COMPOSER_ADAPTER_VERSION = 3 as const

export const EDITOR_SELECTOR = 'textarea, [contenteditable="true"]'
const COMMENT_ROOT_SELECTORS = [
  '[data-testid="comment-composer"]',
  '[data-test-id="comment-composer"]',
  '[data-testid="comment-box"]',
  '[data-test-id="comment-box"]',
  '.comments-comment-box',
  '.comments-comment-texteditor',
  '.comments-comment-box__form-container',
]
const REPLY_ANCESTOR_SELECTOR = '[data-testid*="reply" i], [data-test-id*="reply" i], [aria-label*="reply" i], [class*="reply" i]'
const LABELLED_EDITOR_SELECTOR = [
  '[contenteditable="true"][aria-label="Comment" i]',
  '[contenteditable="true"][aria-label*="Add a comment" i]',
  '[contenteditable="true"][aria-placeholder*="comment" i]',
  '[contenteditable="true"][data-placeholder*="comment" i]',
].join(',')

export function findCommentComposerRoot(editor: HTMLElement): HTMLElement | undefined {
  if (!editor.matches(LABELLED_EDITOR_SELECTOR) && !editor.closest(COMMENT_ROOT_SELECTORS.join(','))) return undefined
  const root = editor.closest<HTMLElement>(COMMENT_ROOT_SELECTORS.join(','))
  if (!root || root.matches(REPLY_ANCESTOR_SELECTOR) || root.closest(REPLY_ANCESTOR_SELECTOR)) return undefined
  const marker = `${root.getAttribute('aria-label') ?? ''} ${root.className}`.toLowerCase()
  return /reply|message|search|start a post/.test(marker) ? undefined : root
}

export function isEligibleCommentComposer(editor: HTMLElement): boolean {
  if (!editor.isConnected || !editor.matches(EDITOR_SELECTOR)) return false
  if (editor.closest('[data-modaicom-inline-wrapper]') || editor.closest(REPLY_ANCESTOR_SELECTOR)) return false
  const attrs = [editor.getAttribute('role'), editor.getAttribute('aria-label'), editor.getAttribute('placeholder')].filter(Boolean).join(' ').toLowerCase()
  if (/search|start a post|message|reply/.test(attrs)) return false
  return Boolean(findCommentComposerRoot(editor))
}
