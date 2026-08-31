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

// Writes `text` into the editor, replacing whatever is currently selected. The
// caller selects the whole editor first when it means to replace; for an empty
// editor the (empty) selection makes this a plain insert. `execCommand`
// replaces the selection, so one path covers both.
export function writeIntoEditor(editor: HTMLElement, text: string): boolean {
  if (editor instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    if (!setter) return false
    setter.call(editor, text)
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    return editor.value === text
  }
  const doc = editor.ownerDocument
  if (typeof doc.execCommand !== 'function') return false
  return doc.execCommand('insertText', false, text)
}

function selectAllContents(editor: HTMLElement): void {
  editor.focus()
  const selection = editor.ownerDocument.getSelection()
  if (!selection) return
  const range = editor.ownerDocument.createRange()
  range.selectNodeContents(editor)
  selection.removeAllRanges()
  selection.addRange(range)
}

export type InsertDraftOptions = {
  // The exact text modaicom last inserted into this editor this session. If the
  // editor still holds precisely that (the user hasn't touched it), a re-insert
  // may replace it. Anything else in the editor is the user's own work.
  previousInsertion?: string
  write?: EditorWriter
}

// Orchestration: no-op if the draft is already there; otherwise write only into
// an editor that is empty or holds modaicom's own untouched prior insertion;
// verify by readback; leave the caret at the end.
export function insertDraft(editor: HTMLElement, text: string, options: InsertDraftOptions = {}): InsertOutcome {
  const write = options.write ?? writeIntoEditor
  const current = editorPlainText(editor)
  const trimmed = text.trim()

  if (current === trimmed) return { ok: true }

  const replacingOwn = options.previousInsertion !== undefined && current === options.previousInsertion.trim()
  if (current !== '' && !replacingOwn) return { ok: false, reason: 'editor-not-empty' }

  if (!(editor instanceof HTMLTextAreaElement)) selectAllContents(editor)
  if (!write(editor, text)) return { ok: false, reason: 'insert-failed' }
  if (!editorPlainText(editor).includes(trimmed)) return { ok: false, reason: 'insert-failed' }
  placeCaretAtEnd(editor)
  return { ok: true }
}
