/**
 * Pure helpers for evaluating conditional field visibility and form-control
 * values. These operate on the live form-state maps the component keeps
 * (`fieldValues` keyed by DOM id, `structuralSelections` keyed by concept id)
 * and are free of any Lit/DOM dependency so they can be unit-tested directly.
 */

import type { Concept } from '../models/index.js'

/**
 * Checks whether a stored form-control value satisfies an expected condition value.
 * Handles exact matches, colon-prefixed concept IDs, hash fragments, and
 * raw conditionValue strings with a prefix.
 * @param stored - The currently stored value of the conditionPath control.
 * @param expected - The normalized expected value to compare against.
 * @returns True when the stored value matches the expected value.
 */
export function valueMatchesExpected(stored: string, expected: string): boolean {
  const s = stored.toLowerCase().trim()
  // 1. Exact match (checkboxes, plain values)
  if (s === expected) return true
  // 2. Colon-suffix match: full concept ID like "prefix:rust" vs local name "rust"
  if (s.endsWith(`:${expected}`)) return true
  // 3. Hash fragment match: URI like "http://...#rust" vs local name "rust"
  if (s.endsWith(`#${expected}`)) return true
  // 4. Stored is the raw conditionValue with prefix (e.g. stored="concept:true", expected="true")
  if (s.includes(':') && s.split(':').pop()!.toLowerCase() === expected) return true
  return false
}

/**
 * Checks whether a concept with conditionPath/conditionValue should be rendered.
 * If no condition is defined the field always shows; otherwise the referenced
 * field's current tracked value must equal `conditionValue`.
 *
 * Handles multiple value formats:
 * - Checkbox: "true" / "false"
 * - Select/code list: full concept ID like "pomptoestand:rust"
 *   where conditionValue normalizes to just "rust"
 * - NaN: show when conditionPath field has no entered value (Number.isNaN check)
 * @param field - The concept whose condition to evaluate.
 * @param fieldValues - Current values of every rendered control, keyed by DOM id.
 * @returns True when the field should be visible.
 */
export function matchesCondition(field: Concept, fieldValues: Map<string, unknown>): boolean {
  const hasConditionValues = !!field.conditionValues && field.conditionValues.length > 0
  if (!field.conditionPath || (!field.conditionValue && !hasConditionValues)) return true
  const refId = field.conditionPath

  // If conditionValues array is set, check ANY of them against the current value of the conditionPath field.
  const conditionValues = field.conditionValues ?? []
  if (hasConditionValues) {
    for (const expected of conditionValues) {
      // NaN sentinel: show when the referenced field has no entered value
      if (expected === 'NaN') {
        const stored = fieldValues.get(refId)
        if (stored === undefined || stored === '' || (Array.isArray(stored) && stored.length === 0)) return true
        const basePrefix = refId.replace(/#\d+$/, '')
        let anyValued = false
        for (const [key, val] of fieldValues.entries()) {
          if (key.startsWith(basePrefix) && val !== undefined && val !== '') { anyValued = true; break }
        }
        if (!anyValued) return true
        continue
      }
      const normExpected = expected.toLowerCase().trim()
      const stored = fieldValues.get(refId)
      if (stored !== undefined && valueMatchesExpected(String(stored), normExpected)) return true
      const basePrefix = refId.replace(/#\d+$/, '')
      for (const [key, val] of fieldValues.entries()) {
        if (key.startsWith(basePrefix) && valueMatchesExpected(String(val), normExpected)) {
          return true
        }
      }
    }
    return false
  }

  // NaN sentinel: show when the referenced field has no entered value
  if (typeof field.conditionValue === 'number' && Number.isNaN(field.conditionValue)) {
    const stored = fieldValues.get(refId)
    if (stored === undefined || stored === '' || (Array.isArray(stored) && stored.length === 0)) return true
    // Also check base prefix for repeatable fields beyond #1
    const basePrefix = refId.replace(/#\d+$/, '')
    let anyValued = false
    for (const [key, val] of fieldValues.entries()) {
      if (key.startsWith(basePrefix) && val !== undefined && val !== '') { anyValued = true; break }
    }
    return !anyValued
  }

  // Normalize condition value for case-insensitive comparison.
  const expected = String(field.conditionValue).toLowerCase().trim()

  // Direct id match first (exact control that was rendered).
  const stored = fieldValues.get(refId)
  if (stored !== undefined && valueMatchesExpected(String(stored), expected)) return true

  // Strip any instance suffix from the reference to get the base prefix.
  const basePrefix = refId.replace(/#\d+$/, '')

  // Check ALL stored values whose key starts with the base prefix,
  // so repeatable-fields on instances beyond #1 also satisfy conditions.
  for (const [key, val] of fieldValues.entries()) {
    if (key.startsWith(basePrefix) && valueMatchesExpected(String(val), expected)) {
      return true
    }
  }

  return false
}

/**
 * Checks whether a concept has any stored value.
 * @param fieldValues - Current values of every rendered control, keyed by DOM id.
 * @param conceptId - The concept/control id to check.
 * @returns True when a non-empty value is stored for the concept.
 */
export function hasValueForConcept(fieldValues: Map<string, unknown>, conceptId: string): boolean {
  const val = fieldValues.get(conceptId)
  if (val === undefined || val === '') return false
  // For multiselect fields, check array length
  if (Array.isArray(val)) return val.length > 0 && val.some(v => v !== '')
  return true
}

/**
 * Returns true when a stored structural value counts as "something selected".
 * @param val - The stored value (string or array of strings).
 * @returns True when at least one non-empty value is present.
 */
export function hasSelection(val: string | string[]): boolean {
  if (Array.isArray(val)) return val.some(v => v && v !== '')
  return val !== ''
}

/**
 * Returns true when any structural element has been selected by the user.
 * @param selections - Mapped structural selections keyed by concept id.
 * @returns True when at least one selection carries a non-empty value.
 */
export function anyStructuralSelected(selections: Map<string, string | string[]>): boolean {
  for (const val of selections.values()) {
    if (Array.isArray(val)) {
      if (val.some(v => v && v !== '')) return true
    } else if (val && val !== '') {
      return true
    }
  }
  return false
}
