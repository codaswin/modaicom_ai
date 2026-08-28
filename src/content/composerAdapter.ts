export const COMPOSER_ADAPTER_VERSION = 1 as const

const EDITOR_SELECTOR = 'textarea, [contenteditable="true"]'
const COMMENT_ROOT_SELECTORS = [
  '[data-testid="comment-composer"]',
  '[data-test-id="comment-composer"]',
  '[data-testid="comment-box"]',
  '[data-test-id="comment-box"]',
]

export function findCommentComposerRoot(editor: HTMLElement): HTMLElement | undefined {
  for (const selector of COMMENT_ROOT_SELECTORS) {
    const root = editor.closest<HTMLElement>(selector)
    if (!root) continue
    const marker = `${root.getAttribute('aria-label') ?? ''} ${root.className}`.toLowerCase()
    if (!/reply|message|search/.test(marker)) return root
  }
  return undefined
}

export function isEligibleCommentComposer(editor: HTMLElement): boolean {
  if (!editor.isConnected || !editor.matches(EDITOR_SELECTOR)) return false
  if (editor.closest('[data-modaicom-inline-wrapper]')) return false
  const attrs = [editor.getAttribute('role'), editor.getAttribute('aria-label'), editor.getAttribute('placeholder')].filter(Boolean).join(' ').toLowerCase()
  if (/search|start a post|message|reply/.test(attrs)) return false
  return Boolean(findCommentComposerRoot(editor))
}
