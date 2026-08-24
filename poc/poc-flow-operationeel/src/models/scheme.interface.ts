/**
 * A SKOS conceptscheme / codescheme (a named collection of related concepts).
 */
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
