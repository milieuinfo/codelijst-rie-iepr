import type { Concept } from './concept.interface.js'
import type { Scheme } from './scheme.interface.js'

/**
 * Raw JSON-LD node as it appears in the rie-iepr.jsonld graph. The file mixes
 * `@id`/`@type` (JSON-LD keywords) and `id`/`_type` (compacted aliases used by
 * this particular export) for the same thing, and the same node can appear
 * both flattened at the top level of `graph` and re-embedded inline wherever
 * something else references it. Any field can therefore hold either a bare id
 * string or a fully inlined node.
 */
export type JsonLdNode = Record<string, unknown>

/**
 * A parsed codelist: every node in the document merged into one canonical
 * index, plus typed `Concept` / `Scheme` views derived from that index.
 */
export interface CodelistResult {
  /** Every node in the document, keyed by id, merged across every place it was found. */
  nodesById: Map<string, JsonLdNode>
  schemes: Map<string, Scheme>
  concepts: Map<string, Concept>
  topConcepts: Map<string, Concept[]>
}

/** Options controlling how the codelist JSON-LD is parsed. */
export interface CodelistOptions {
  normalizeBooleans?: boolean
}
