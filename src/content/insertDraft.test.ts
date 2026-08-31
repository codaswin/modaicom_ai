import { describe, expect, it, vi } from 'vitest'

import { editorPlainText, insertDraft, isEditorEmpty } from './insertDraft'

function contentEditable(html = ''): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('contenteditable', 'true')
  el.innerHTML = html
  document.body.append(el)
  return el
}

// A stub writer that mimics execCommand('insertText'): it replaces the current
// selection, so a full-editor selection means replace and a collapsed one means
// plain insert.
const stubWriter = (editor: HTMLElement, text: string): boolean => {
  const sel = editor.ownerDocument.getSelection()
  if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) sel.getRangeAt(0).deleteContents()
  editor.textContent = (editor.textContent ?? '') + text
  return true
}

describe('editorPlainText / isEditorEmpty', () => {
  it.each([
    ['<br>', true],
    ['<p><br></p>', true],
    ['<p></p>', true],
    ['   \n  ', true],
    ['<p>​</p>', true],
    ['<p>Real words</p>', false],
    ['already typed', false],
  ])('treats %j as empty=%s', (html, empty) => {
    expect(isEditorEmpty(contentEditable(html))).toBe(empty)
  })

  it('ignores a placeholder attribute (only textContent counts)', () => {
    const el = contentEditable('')
    el.setAttribute('data-placeholder', 'Add a comment…')
    el.setAttribute('aria-placeholder', 'Add a comment…')
    expect(isEditorEmpty(el)).toBe(true)
  })

  it('trims surrounding whitespace from the reported text', () => {
    expect(editorPlainText(contentEditable('  <p>hi there</p>  '))).toBe('hi there')
  })
})

describe('insertDraft', () => {
  it('writes into an empty editor and reports success', () => {
    const editor = contentEditable('<p><br></p>')
    const write = vi.fn(stubWriter)
    expect(insertDraft(editor, 'A drafted reply.', { write })).toEqual({ ok: true })
    expect(editorPlainText(editor)).toBe('A drafted reply.')
  })

  it('is a no-op when the editor already holds exactly this draft', () => {
    const editor = contentEditable('<p>A drafted reply.</p>')
    const write = vi.fn(stubWriter)
    expect(insertDraft(editor, 'A drafted reply.', { write })).toEqual({ ok: true })
    expect(write).not.toHaveBeenCalled()
  })

  it('refuses when the editor contains text the user wrote', () => {
    const editor = contentEditable('<p>Half a thought</p>')
    const write = vi.fn(stubWriter)
    expect(insertDraft(editor, 'A drafted reply.', { write })).toEqual({ ok: false, reason: 'editor-not-empty' })
    expect(write).not.toHaveBeenCalled()
    expect(editorPlainText(editor)).toBe('Half a thought')
  })

  it('replaces modaicom’s own untouched prior insertion', () => {
    const editor = contentEditable('<p>Old modaicom draft.</p>')
    expect(
      insertDraft(editor, 'New modaicom draft.', { previousInsertion: 'Old modaicom draft.', write: stubWriter }),
    ).toEqual({ ok: true })
    expect(editorPlainText(editor)).toBe('New modaicom draft.')
  })

  it('refuses when the prior insertion has been edited by even one character', () => {
    const editor = contentEditable('<p>Old modaicom draft, plus my edit.</p>')
    expect(
      insertDraft(editor, 'New modaicom draft.', { previousInsertion: 'Old modaicom draft.', write: stubWriter }),
    ).toEqual({ ok: false, reason: 'editor-not-empty' })
    expect(editorPlainText(editor)).toBe('Old modaicom draft, plus my edit.')
  })

  it('reports insert-failed when the writer returns false', () => {
    expect(insertDraft(contentEditable(), 'A drafted reply.', { write: () => false })).toEqual({
      ok: false,
      reason: 'insert-failed',
    })
  })

  it('reports insert-failed when the writer claims success but the text is not there', () => {
    expect(insertDraft(contentEditable(), 'A drafted reply.', { write: () => true })).toEqual({
      ok: false,
      reason: 'insert-failed',
    })
  })

  it('uses the real writer by default, which fails closed without execCommand (jsdom)', () => {
    expect(insertDraft(contentEditable(), 'A drafted reply.')).toEqual({ ok: false, reason: 'insert-failed' })
  })
})
