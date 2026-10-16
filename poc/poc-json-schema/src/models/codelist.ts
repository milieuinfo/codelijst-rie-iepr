export type JsonLdNode = Record<string, unknown>

export interface CodelistResult {
  nodesById: Map<string, JsonLdNode>
  schemes: Map<string, Scheme>
  concepts: Map<string, Concept>
  topConcepts: Map<string, Concept[]>
  /** Member ids of every skos:Collection, keyed by collection id (members may be external, e.g. CSOR variabelen). */
  collections: Map<string, string[]>
  /** Expand a CURIE ID to its full URI form using the source JSON-LD @context. */
  expandCurie?(curie: string): string
}

export interface Scheme {
  id: string
  type?: string[]
  prefLabel?: string
  definition?: string
  note?: string
  relevantRiepr?: string[]
  seeAlso?: string[]
}

export interface Concept {
  id: string
  type?: string[]
  inScheme?: string
  code?: string
  prefLabel?: string
  altLabel?: string[]
  definition?: string
  note?: string
  broaderPartitive?: string[]
  narrower?: string[]
  topConceptOf?: string

  isVerplicht?: boolean | string
  isMeervoudig?: boolean | string
  isMeetbaar?: boolean | string
  isOnzichtbaar?: boolean | string
  isMultiselect?: boolean | string
  relevantDataType?: string
  relevantCodeList?: string[]
  relevantRiepr?: string[]
  relevantUnit?: string[]
  relevantProperty?: string
  relevantClass?: string
  conditionPath?: string
  conditionValue?: string
  minValue?: number
  maxValue?: number
  seeAlso?: string[]
  relation?: string
  /** UI ordering annotation: whether this concept renders as the first UI element */
  uiFirst?: boolean
  /** UI ordering annotation: concept ID this element renders visually after */
  uiAfter?: string
  /** CSOR kwantificeerbaar aspect of the value (CURIE, e.g. csor_kwantificeerbaaraspect:KWA_1) */
  kwantiteitsAspect?: string
  /** CSOR drager of the value (CURIE, e.g. csor_drager:DR_1) */
  drager?: string
  /** CSOR soort waardebepaling of the value (CURIE, e.g. csor_soortwaardebepaling:SWB_1) */
  soortWaartbepaling?: string
  /** Concept ID of the field in the same group where the stof (CSOR variabele) is selected */
  variabele?: string
  /** Related composite concepts (alternative variants of one logical group) */
  related?: string[]
}
