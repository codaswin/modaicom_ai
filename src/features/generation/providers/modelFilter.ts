// Pure: raw model records + a preset's declarative rules -> the models a user
// may pick. No `chrome.*`, no `fetch`, no provider branch (ADR-0012).

import type { ModelInfo } from '../types'
import type { ModelFilterRules, RawModelRecord } from './preset'

function keep(record: RawModelRecord, rules: ModelFilterRules): boolean {
  if (rules.requireMethod && !record.methods?.includes(rules.requireMethod)) return false
  if (rules.allow && !rules.allow.some((pattern) => pattern.test(record.id))) return false
  if (rules.deny && rules.deny.some((pattern) => pattern.test(record.id))) return false
  return true
}

export function modelFilter(records: readonly RawModelRecord[], rules: ModelFilterRules): ModelInfo[] {
  const seen = new Set<string>()
  const kept: ModelInfo[] = []
  for (const record of records) {
    if (!record.id || seen.has(record.id) || !keep(record, rules)) continue
    seen.add(record.id)
    kept.push(record.label ? { id: record.id, label: record.label } : { id: record.id })
  }
  return kept
}
