/**
 * A single SKOS concept from the RIE-IEPR codelist: a systeemtype, a
 * systeemeigenschap (or one of its composite children) or an option of an
 * inline selection list.
 *
 * All relations are resolved to plain id strings (never inline nodes) so
 * consumers look up related entities through `CodelistResult.concepts` /
 * `.schemes` — one canonical copy per id, regardless of whether the source
 * JSON-LD had it flattened, inlined, or both.
 */
export interface Concept {
  id: string
  type?: string[]
  inScheme?: string
  code?: string
  prefLabel?: string
  altLabel?: string[]
  definition?: string
  note?: string
  /** The parent type within the same type scheme (`skos:broader`). */
  broader?: string
  /** The composite parent of a composite child (`skos:broaderPartitive`). */
  broaderPartitive?: string[]
  hasPart?: string[]
  topConceptOf?: string
  /** Free-text remark from the source (used as a tooltip in the UI). */
  scopeNote?: string

  // RIE-IEPR specific properties
  isVerplicht?: boolean
  isMeervoudig?: boolean
  isMeetbaar?: boolean
  isOnzichtbaar?: boolean
  isMultiselect?: boolean
  relevantDataType?: string
  relevantCodeList?: string[]
  relevantRiepr?: string[]
  relevantUnit?: string[]
  relevantProperty?: string
  /** RDFS relation predicate of a composite child (e.g. `rdfs:label`, `riepr:parameter`). */
  relation?: string
}
