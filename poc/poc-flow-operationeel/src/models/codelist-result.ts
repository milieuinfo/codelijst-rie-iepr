import type { Concept } from './concept.interface.js'
import type { Scheme } from './scheme.interface.js'

import type { Term } from 'n3'

/**
 * The properties of one subject in the codelist graph: predicate IRI → objects.
 */
export type RdfNode = Map<string, Term[]>

/**
 * A parsed codelist: every node in the document merged into one canonical
 * index, plus typed `Concept` / `Scheme` views derived from that index.
 */
export interface CodelistResult {
  /** Every subject in the document, keyed by its compacted id. */
  nodesById: Map<string, RdfNode>
  schemes: Map<string, Scheme>
  concepts: Map<string, Concept>
  topConcepts: Map<string, Concept[]>
  /** Member ids of every `skos:Collection`, keyed by collection id (members may be external, e.g. CSOR variabelen). */
  collections: Map<string, string[]>
  /**
   * The prefix map used to compact the ids (the POC's own prefixes from
   * `services/vocab.ts`, then the document's), used to expand CURIE ids
   * (e.g. `lucht:brandstof`) to their full published URI for the hover
   * tooltips (`services/uri.ts`).
   */
  prefixes: Record<string, string>
}

/** Options controlling how the codelist is parsed. */
export interface CodelistOptions {
  normalizeBooleans?: boolean
}
