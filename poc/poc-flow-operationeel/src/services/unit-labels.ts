/**
 * @file Display labels for `relevantUnit` references.
 *
 * CSOR eenheden (`csor_eenheid:E_*`) are resolved from the generated
 * `csor.json` (see `scripts/sync-csor.mjs`): they are shown by their symbol
 * (e.g. `mg/L`). Units defined in the local JSON-LD document take priority in
 * the caller; the small whitelist below only covers the remaining local ids
 * that are not part of the document, plus the `http://TODO` placeholder.
 *
 * Extensible — add new entries as previously-unresolvable units appear in
 * future versions of the source data.
 */

import { CsorService } from './csor.js'

const csor = new CsorService()

export const UNIT_LABELS: Record<string, string> = {
  // --- Common measurement units (referenced but not locally-defined) ---
  'unit:M3': 'm³',
  'unit:M3-PER-YR': 'm³/jaar',
  'unit:DAY': 'dag',
  'qudt-unit:GigaJ': 'GJ',

  // --- Placeholder in the source data: no unit shown ---
  'http://TODO': '',
}

/**
 * Resolves a unit ID to a human-readable display label.
 * @param unitId - The `relevantUnit` reference.
 * @returns The label or symbol, or undefined when no label is available.
 */
export function resolveUnitLabel(unitId: string): string | undefined {
  const entry = UNIT_LABELS[unitId]
  // Empty-string entries mean "we know this ref but have no good label for it"
  if (typeof entry === 'string') return entry !== '' ? entry : undefined
  // CSOR eenheden (csor_eenheid:E_*) are shown by their symbol
  if (unitId.startsWith('csor_')) return csor.resolveUnitLabel(unitId)
  return undefined
}
