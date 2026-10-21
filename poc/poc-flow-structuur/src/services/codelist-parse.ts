/**
 * Parses the raw RIE-IEPR codelist JSON-LD document into a `CodelistResult`.
 *
 * The strategy is deliberately generic and content-agnostic: it does not
 * special-case any particular conceptscheme or property. It builds a single
 * id → node index by recursively flattening the entire document (top-level
 * `graph` plus every inline/nested node reachable from it), then derives typed
 * `Scheme` / `Concept` views from that index. New conceptschemes or properties
 * added to the source data need no code changes here.
 */

import type { CodelistResult, JsonLdNode, Scheme, Concept } from '../models/index.js'

const SCHEME_TYPES = ['skos:ConceptScheme']
const CONCEPT_TYPES = ['skos:Concept']
const COLLECTION_TYPES = ['skos:Collection']

/**
 * Recursively walks every object/array in the graph and indexes every node
 * that has an id, merging duplicate sightings of the same id (a node seen
 * fully inline somewhere is more complete than a bare-string reference
 * elsewhere, so later/fuller sightings fill in missing properties rather
 * than replacing what's already known).
 * @param root - The top-level graph array or single node to walk.
 * @returns A map from each node's id string to its merged property set.
 */
function buildNodeIndex(root: unknown): Map<string, JsonLdNode> {
  const nodesById = new Map<string, JsonLdNode>()
  const seen = new Set<unknown>()

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }

    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)

    const node = value as JsonLdNode
    const id = idOf(node)

    if (id) {
      const existing = nodesById.get(id)
      if (existing) {
        for (const [key, val] of Object.entries(node)) {
          if (existing[key] === undefined) existing[key] = val
        }
      } else {
        nodesById.set(id, { ...node })
      }
    }

    for (const val of Object.values(node)) visit(val)
  }

  visit(root)
  return nodesById
}

/**
 * Coerce a JSON-LD `@id`/`id` ref (a bare string or an inlined node) to a plain id string.
 * @param value - The raw ref value (string or inlined node).
 * @returns The id string, or undefined when the value carries no id.
 */
function idOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const id = (value as JsonLdNode)['@id'] ?? (value as JsonLdNode)['id']
    return typeof id === 'string' ? id : undefined
  }
  return undefined
}

/**
 * Extract the `@type` value(s) from a JSON-LD node as a plain string array.
 * @param node - The JSON-LD node to read the type from.
 * @returns Array of type strings (empty when the node has no type).
 */
function getTypes(node: JsonLdNode): string[] {
  const raw = node['@type'] ?? node['_type']
  if (!raw) return []
  return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : [String(raw)]
}

/**
 * Convert a JSON-LD scheme node to a typed Scheme. All references are stored
 * as id strings; callers resolve them via `result.schemes.get(id)`.
 * @param node - The raw scheme node.
 * @returns The typed Scheme view.
 */
function toScheme(node: JsonLdNode): Scheme {
  return {
    id: String(idOf(node)),
    type: getTypes(node),
    prefLabel: getValue(node, ['prefLabel', 'has_pref_label']) as string | undefined,
    definition: getValue(node, ['definition', 'has_definition']) as string | undefined,
    note: getValue(node, ['note', 'has_note']) as string | undefined,
  }
}

/**
 * Convert a JSON-LD concept node to a typed Concept. All references are stored
 * as id strings; callers resolve them via `result.concepts.get(id)`.
 * @param node - The raw concept node.
 * @returns The typed Concept view.
 */
function toConcept(node: JsonLdNode): Concept {
  return {
    id: String(idOf(node)),
    type: getTypes(node),
    inScheme: idOf(getValue(node, ['inScheme', 'in_scheme'])),
    code: getValue(node, ['code', 'notation']) as string | undefined,
    prefLabel: getValue(node, ['prefLabel', 'has_pref_label']) as string | undefined,
    altLabel: getValue(node, ['altLabel', 'alt_label']) as string[] | undefined,
    definition: getValue(node, ['definition', 'has_definition']) as string | undefined,
    note: getValue(node, ['note', 'has_note']) as string | undefined,
    broader: idOf(getValue(node, ['broader'])),
    broaderPartitive: idsOf(getValue(node, ['broaderPartitive'])),
    hasPart: idsOf(getValue(node, ['narrowerPartitive', 'hasPart'])),
    topConceptOf: idOf(getValue(node, ['topConceptOf', 'top_concept_of'])),
    scopeNote: getValue(node, ['scopeNote', 'scope_note']) as string | undefined,
    isVerplicht: parseBoolean(getValue(node, ['isVerplicht', 'is_verplicht'])),
    isMeervoudig: parseBoolean(getValue(node, ['isMeervoudig', 'is_meervoudig'])),
    isMeetbaar: parseBoolean(getValue(node, ['isMeetbaar', 'is_meetbaar'])),
    isOnzichtbaar: parseBoolean(getValue(node, ['isOnzichtbaar', 'is_onzichtbaar'])),
    isMultiselect: parseBoolean(getValue(node, ['isMultiselect', 'is_multiselect'])),
    relevantDataType: asString(getValue(node, ['relevantDataType', 'relevant_data_type'])),
    relevantCodeList: idsOf(getValue(node, ['relevantCodeList', 'relevant_code_list'])),
    relevantRiepr: idsOf(getValue(node, ['relevantRiepr', 'relevant_riepr'])),
    relevantUnit: idsOf(getValue(node, ['relevantUnit', 'relevant_unit'])),
    relevantProperty: asString(getValue(node, ['relevantProperty', 'relevant_property'])),
    relation: asString(getValue(node, ['relation'])),
  }
}

/**
 * Normalizes a single ref or array-of-refs field down to an array of ids.
 * Handles embedded objects ({@id}), plain strings, and comma-separated
 * strings within array elements (e.g. "type:a,type:b" → ["type:a","type:b"]).
 * @param value - The raw reference value.
 * @returns Array of resolved id strings, or undefined if no valid refs found.
 */
function idsOf(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined
  const arr = Array.isArray(value) ? value : [value]
  // Expand comma-separated strings before extracting IDs
  const expanded = arr.flatMap((v) => {
    if (typeof v === 'string' && v.includes(',')) {
      return v.split(',').map((s) => s.trim()).filter(Boolean)
    }
    return [v]
  })
  const ids = expanded.map((v) => idOf(v)).filter((v): v is string => v !== undefined)
  return ids.length > 0 ? ids : undefined
}

/**
 * Coerce a JSON-LD value to `boolean | undefined`; accepts `"true"`/`"1"` and `"false"`/`"0"` strings.
 * @param value - The raw value to coerce.
 * @returns The boolean, or undefined when it is not a recognizable boolean.
 */
function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim()
    if (lower === 'true' || lower === '1') return true
    if (lower === 'false' || lower === '0') return false
  }
  return undefined
}

/**
 * Coerce a JSON-LD value to a string, accepting single-item arrays.
 * @param value - The raw value.
 * @returns The string, or undefined when it is not a scalar.
 */
function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

/**
 * Read the first present property value from a node, trying compacted aliases and the
 * standard JSON-LD keyword form.
 * @param obj - The node object to read from.
 * @param keys - The property keys to try, in priority order.
 * @returns The first defined value, or undefined when none are present.
 */
function getValue(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key]
  }
  return undefined
}

/**
 * Parse the raw codelist JSON-LD document into a `CodelistResult`.
 * @param data - The parsed JSON-LD document (top-level `graph` expected).
 * @returns The parsed CodelistResult (nodesById, schemes, concepts, topConcepts, collections).
 */
export function parseCodelist(data: Record<string, unknown>): CodelistResult {
  const graph = Array.isArray(data['graph']) ? data['graph'] : data['graph'] ? [data['graph']] : []

  const nodesById = buildNodeIndex(graph)

  const schemes = new Map<string, Scheme>()
  const concepts = new Map<string, Concept>()
  const collections = new Map<string, string[]>()

  for (const [id, node] of nodesById.entries()) {
    const types = getTypes(node)

    if (types.some((t) => SCHEME_TYPES.includes(t))) {
      schemes.set(id, toScheme(node))
    }

    // A node can be both a skos:Concept and something else; schemes and
    // concepts are not mutually exclusive checks.
    if (types.some((t) => CONCEPT_TYPES.includes(t))) {
      concepts.set(id, toConcept(node))
    }

    if (types.some((t) => COLLECTION_TYPES.includes(t))) {
      collections.set(id, idsOf(getValue(node, ['member'])) ?? [])
    }
  }

  const topConcepts = new Map<string, Concept[]>()

  for (const [schemeId, node] of nodesById.entries()) {
    const hasTopConcept = node['hasTopConcept'] ?? node['has_top_concept']

    if (!hasTopConcept) continue

    const refs = Array.isArray(hasTopConcept) ? hasTopConcept : [hasTopConcept]
    const resolved: Concept[] = []

    for (const ref of refs) {
      const refId = idOf(ref)
      const concept = refId ? concepts.get(refId) : undefined
      if (concept) resolved.push(concept)
    }

    topConcepts.set(schemeId, resolved)
  }

  return { nodesById, schemes, concepts, topConcepts, collections }
}
