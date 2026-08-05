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
  conditionValue?: string | number  // NaN sentinel: show field when conditionPath has no value
  /** Links to another scheme or concept for multi-step flows. When a structural element is selected,
   * the app transitions to the target scheme referenced here. Points at a `skos:ConceptScheme` id.
   * Replaces the old pattern where `relevantRiepr` was used for theme→scheme navigation. */
  seeAlso?: string[]
  /** Indicates that a structural picker allows multiple selections (e.g., selecting multiple bronnen). */
  isMultiselect?: boolean | string
  /** SOSA class mapping — e.g., `sosa:Observation`, `sosa:FeatureOfInterest`. Used for future backend integration. */
  relevantClass?: string
  /** Optional Dutch instruction text shown when structural/procedural picker gating hides composite children.
   * When absent, a default message derived from the relatedRiepr concept's definition or prefLabel is used. */
  selecteerEerstMessage?: string
}

export interface Scheme {
  id: string
  type?: string[]
  prefLabel?: string
  definition?: string
  note?: string
  /** Points at a structural type concept (e.g. a meetpunt/installatie type) this scheme's data is collected for. */
  relevantRiepr?: string[]
  /** Links to another scheme for multi-step flows. Resolved to a `skos:ConceptScheme` id. */
  seeAlso?: string[]
}


