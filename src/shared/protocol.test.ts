import { describe, expect, it } from 'vitest'

import {
  GENERATION_PROTOCOL_VERSION,
  REQUEST_PAGE_EXTRACTION,
  isGenerationOneShotMessage,
  isGenerationPortMessage,
  isGenerationResultMessage,
  isInsertDraftMessage,
  isInsertFailureKind,
  isRequestPageExtractionMessage,
} from './protocol'

const V = GENERATION_PROTOCOL_VERSION

describe('isRequestPageExtractionMessage', () => {
  it('accepts the canonical envelope', () => {
    expect(isRequestPageExtractionMessage(REQUEST_PAGE_EXTRACTION)).toBe(true)
    expect(isRequestPageExtractionMessage({ version: 2, type: 'REQUEST_PAGE_EXTRACTION' })).toBe(true)
  })

  it.each([
    undefined,
    null,
    'REQUEST_PAGE_EXTRACTION',
    {},
    { type: 'REQUEST_PAGE_EXTRACTION' },
    { version: 1, type: 'REQUEST_PAGE_EXTRACTION' },
    { version: 2, type: 'GET_LATEST_RELAY' },
    { version: '1', type: 'REQUEST_PAGE_EXTRACTION' },
  ])('rejects malformed value %j', (value) => {
    expect(isRequestPageExtractionMessage(value)).toBe(false)
  })
})

describe('isInsertDraftMessage', () => {
  const base = { version: 2, type: 'INSERT_DRAFT', text: 'A drafted reply.', sessionId: 's-1', generation: 3 }

  it('accepts the canonical envelope', () => {
    expect(isInsertDraftMessage(base)).toBe(true)
    expect(isInsertDraftMessage({ ...base, generation: 0 })).toBe(true)
  })

  it.each([
    ['wrong version', { ...base, version: 1 }],
    ['wrong type', { ...base, type: 'INSERT' }],
    ['empty text', { ...base, text: '' }],
    ['non-string text', { ...base, text: 42 }],
    ['empty sessionId', { ...base, sessionId: '' }],
    ['missing generation', { version: 2, type: 'INSERT_DRAFT', text: 'x', sessionId: 's' }],
    ['non-finite generation', { ...base, generation: Number.NaN }],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(isInsertDraftMessage(value)).toBe(false)
  })

  it('recognises every insert failure kind', () => {
    for (const kind of ['editor-unavailable', 'route-changed', 'editor-not-empty', 'insert-failed', 'wrong-tab']) {
      expect(isInsertFailureKind(kind)).toBe(true)
    }
    expect(isInsertFailureKind('nope')).toBe(false)
    expect(isInsertFailureKind(undefined)).toBe(false)
  })
})

describe('generation protocol guards', () => {
  it('accepts the Port inbound messages', () => {
    expect(isGenerationPortMessage({ v: V, type: 'REQUEST_GENERATION', request: {}, preferences: {} })).toBe(true)
    expect(isGenerationPortMessage({ v: V, type: 'CANCEL_GENERATION' })).toBe(true)
  })

  it('is the v2 protocol', () => {
    expect(GENERATION_PROTOCOL_VERSION).toBe(2)
  })

  it('accepts the one-shot messages', () => {
    expect(isGenerationOneShotMessage({ v: V, type: 'GET_PROVIDER_STATUS' })).toBe(true)
    expect(isGenerationOneShotMessage({ v: V, type: 'TEST_PROVIDER' })).toBe(true)
    expect(isGenerationOneShotMessage({ v: V, type: 'RECORD_TRANSMISSION_CONSENT', providerId: 'openai' })).toBe(true)
  })

  it('accepts result messages', () => {
    expect(isGenerationResultMessage({ v: V, type: 'GENERATION_RESULT', ok: true, text: 'hi' })).toBe(true)
    expect(isGenerationResultMessage({ v: V, type: 'GENERATION_RESULT', ok: false, error: { kind: 'rate-limited' } })).toBe(true)
  })

  it.each([
    { v: 1, type: 'REQUEST_GENERATION', request: {}, preferences: {} },
    { v: V, type: 'REQUEST_GENERATION', request: {} },
    { v: V, type: 'REQUEST_GENERATION', preferences: {} },
    { v: V, type: 'GET_LATEST_RELAY' },
    { v: V, type: 'RECORD_TRANSMISSION_CONSENT' },
    { type: 'CANCEL_GENERATION' },
    null,
  ])('rejects wrong version / shape %j', (value) => {
    expect(isGenerationPortMessage(value)).toBe(false)
    expect(isGenerationOneShotMessage(value)).toBe(false)
  })
})
