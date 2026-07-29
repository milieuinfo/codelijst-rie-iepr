/**
 * @file Local mapping of common unit IDs to human-readable display labels.
 *
 * This whitelist covers all units referenced by `relevantUnit` in the RIE-IEPR
 * codelist that are not defined inline in the local JSON-LD document. Units
 * defined in the codelist itself (`result.concepts.get(uid)`) take priority;
 * this map is consulted only when concept lookup fails.
 *
 * Extensible — add new entries as previously-unresolvable units appear in
 * future versions of the source data. Remote resolution via rdfs:label can
 * be layered on top later without breaking existing behavior.
 */

export const UNIT_LABELS: Record<string, string> = {
  // --- Common measurement units (referenced but not locally-defined) ---
  'unit:M3': 'm³',
  'unit:M3-PER-YR': 'm³/jaar',
  'unit:DAY': 'dag',
  'qudt-unit:GigaJ': 'GJ',

  // --- Frequently-used fallbacks for unresolvable refs ---
  'http://TODO': '', // placeholder → no label shown
}

/**
 * Resolves a unit ID to a human-readable display label.
 * Returns undefined if the unit is not found in the local whitelist,
 * allowing callers to fall back to raw ID fragments or other strategies.
 * 
 * Entries with empty-string values (e.g. 'http://TODO') are treated as
 * "no label available" and also return undefined.
 */
export function resolveUnitLabel(unitId: string): string | undefined {
  const entry = UNIT_LABELS[unitId]
  // Empty-string entries mean "we know this ref but have no good label for it"
  return typeof entry === 'string' && entry !== '' ? entry : undefined
}
