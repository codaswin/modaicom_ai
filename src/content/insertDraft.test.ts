import { describe, expect, it, vi } from 'vitest'

import { editorPlainText, insertDraft, isEditorEmpty } from './insertDraft'

function contentEditable(html = ''): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('contenteditable', 'true')
  el.innerHTML = html
  document.body.append(el)
  return el
}

// A stub writer that mimics execCommand('insertText') into an empty editor.
const appendWriter = (editor: HTMLElement, text: string): boolean => {
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

  it('trims surrounding whitespace from the reported text', () => {
    expect(editorPlainText(contentEditable('  <p>hi there</p>  '))).toBe('hi there')
  })
})

describe('insertDraft', () => {
  it('writes into an empty editor and reports success', () => {
    const editor = contentEditable('<p><br></p>')
    const write = vi.fn(appendWriter)
    expect(insertDraft(editor, 'A drafted reply.', write)).toEqual({ ok: true })
    expect(write).toHaveBeenCalledWith(editor, 'A drafted reply.')
    expect(editorPlainText(editor)).toContain('A drafted reply.')
  })

  it('refuses when the editor already contains user text', () => {
    const editor = contentEditable('<p>Half a thought</p>')
    const write = vi.fn(appendWriter)
    expect(insertDraft(editor, 'A drafted reply.', write)).toEqual({ ok: false, reason: 'editor-not-empty' })
    expect(write).not.toHaveBeenCalled()
    expect(editorPlainText(editor)).toBe('Half a thought')
  })

  it('reports insert-failed when the writer returns false', () => {
    const editor = contentEditable()
    expect(insertDraft(editor, 'A drafted reply.', () => false)).toEqual({ ok: false, reason: 'insert-failed' })
  })

  it('reports insert-failed when the writer claims success but the text is not there', () => {
    const editor = contentEditable()
    expect(insertDraft(editor, 'A drafted reply.', () => true)).toEqual({ ok: false, reason: 'insert-failed' })
  })

  it('uses the real writer by default, which fails closed without execCommand (jsdom)', () => {
    // jsdom has no document.execCommand — the real primitive returns false and
    // insertDraft surfaces insert-failed rather than a silent nothing.
    const editor = contentEditable()
    expect(insertDraft(editor, 'A drafted reply.')).toEqual({ ok: false, reason: 'insert-failed' })
  })
})
