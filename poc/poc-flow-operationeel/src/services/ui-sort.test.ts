// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applyUiOrdering } from './ui-sort.js'
import type { Concept } from '../models/index.js'

const ids = (fields: Concept[]) => applyUiOrdering(fields).map(field => field.id)

describe('Source-declared conditional field order', () => {
  it('preserves the complete chain through a conditional cause field', () => {
    expect(ids([
      { id: 'type', uiFirst: true },
      { id: 'state', uiAfter: 'cause' },
      { id: 'temperature', uiAfter: 'state' },
      { id: 'cause', uiAfter: 'type', conditionPath: 'type', conditionValue: 'abnormal' },
    ])).toEqual(['type', 'cause', 'state', 'temperature'])
  })

  it('orders nested conditions after their triggers without moving all dependents to the end', () => {
    expect(ids([
      { id: 'detail', conditionPath: 'trigger', conditionValue: 0 },
      { id: 'trigger' },
      { id: 'unrelated' },
      { id: 'nested', conditionPath: 'detail', conditionValues: ['a', 'b'] },
    ])).toEqual(['trigger', 'detail', 'unrelated', 'nested'])
  })

  it('respects free predecessors and ignores external ancestor conditions', () => {
    expect(ids([
      { id: 'child', uiAfter: 'parent' },
      { id: 'parent' },
      { id: 'other', conditionPath: 'ancestor', conditionValue: 'yes' },
    ])).toEqual(['parent', 'child', 'other'])
  })

  it('rejects contradictory condition and UI dependencies', () => {
    expect(() => ids([
      { id: 'trigger', uiAfter: 'detail' },
      { id: 'detail', conditionPath: 'trigger', conditionValue: 'yes' },
    ])).toThrow('Cyclic UI/condition ordering')
  })
})
