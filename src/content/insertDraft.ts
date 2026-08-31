// Writes a Generated Draft into a LinkedIn comment/reply editor (Phase 8 /
// ADR-0011). DOM-only — no chrome, no adapters. The read adapters stay
// read-only; this is the one module that mutates an editor.
//
// `writeIntoEditor` is the single browser-primitive seam: production uses
// `execCommand('insertText')` (contenteditable) / the native value setter
// (textarea), both of which route through the real editing pipeline so Quill and
// TipTap register the text and their Post button enables. Tests pass a stub.

export type InsertOutcome = { ok: true } | { ok: false; reason: 'editor-not-empty' | 'insert-failed' }

export type EditorWriter = (editor: HTMLElement, text: string) => boolean

// Zero-width space / BOM that rich-text editors sometimes seed an "empty" node
// with — treated as no content.
const ZERO_WIDTH = /[\u200B\uFEFF]/g

// The visible text of an editor, trimmed. A lone <br>, an empty <p>, and
// LinkedIn's placeholder (rendered via CSS ::before, never in textContent) all
// yield "".
export function editorPlainText(editor: HTMLElement): string {
  return (editor.textContent ?? '').replace(ZERO_WIDTH, '').trim()
}

export function isEditorEmpty(editor: HTMLElement): boolean {
  return editorPlainText(editor) === ''
}

function placeCaretAtEnd(editor: HTMLElement): void {
  if (editor instanceof HTMLTextAreaElement) {
    const end = editor.value.length
    editor.setSelectionRange(end, end)
    return
  }
  const selection = editor.ownerDocument.getSelection()
  if (!selection) return
  const range = editor.ownerDocument.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function writeIntoEditor(editor: HTMLElement, text: string): boolean {
  if (editor instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    if (!setter) return false
    setter.call(editor, text)
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    return editor.value === text
  }
  editor.focus()
  placeCaretAtEnd(editor)
  const doc = editor.ownerDocument
  if (typeof doc.execCommand !== 'function') return false
  return doc.execCommand('insertText', false, text)
}

// Orchestration: empty-check -> write -> verify by readback -> leave caret at
// end. Ticket 2 scope: only an empty editor is written; anything else refuses.
export function insertDraft(editor: HTMLElement, text: string, write: EditorWriter = writeIntoEditor): InsertOutcome {
  if (!isEditorEmpty(editor)) return { ok: false, reason: 'editor-not-empty' }
  if (!write(editor, text)) return { ok: false, reason: 'insert-failed' }
  if (!editorPlainText(editor).includes(text.trim())) return { ok: false, reason: 'insert-failed' }
  placeCaretAtEnd(editor)
  return { ok: true }
}
