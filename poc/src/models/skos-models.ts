/**
 * @file SKOS/RDF data models for RIE-IEPR codelists.
 */

/**
 * All relations are resolved down to plain id strings (never inline nodes or
 * scheme/unit objects) so consumers always look up related entities through
 * `CodelistResult.concepts` / `.schemes` — one canonical copy per id,
 * regardless of whether the source JSON-LD had it flattened, inlined, or
 * both.
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
  broader?: string[]
  narrower?: string[]
  topConceptOf?: string
  broaderTransitive?: string[]
  narrowerTransitive?: string[]
  semanticRelation?: string[]

  // RIE-IEPR specific properties
  isVerplicht?: boolean | string
  isMeervoudig?: boolean | string
  isMeetbaar?: boolean | string
  isOnzichtbaar?: boolean | string
  relevantDataType?: string
  relevantCodeList?: string[]
  relevantRiepr?: string[]
  relevantUnit?: string[]
  relevantProperty?: string
  /** Reference (id) to another concept/field in the same form whose current value gates visibility of this field. */
  conditionPath?: string
  /** The value that the referenced field's current input must equal for this field to be shown. */
  conditionValue?: string
}

export interface Scheme {
  id: string
  type?: string[]
  prefLabel?: string
  definition?: string
  note?: string
  /** Points at a structural type concept (e.g. a meetpunt/installatie type) this scheme's data is collected for. */
  relevantRiepr?: string[]
}


