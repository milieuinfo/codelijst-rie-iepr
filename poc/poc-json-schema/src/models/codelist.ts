export type JsonLdNode = Record<string, unknown>

export interface CodelistResult {
  nodesById: Map<string, JsonLdNode>
  schemes: Map<string, Scheme>
  concepts: Map<string, Concept>
  topConcepts: Map<string, Concept[]>
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
  broader?: string[]
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
  seeAlso?: string[]
}
