/**
 * @file The typed model this POC's components work with (plan 02).
 *
 * `structuur-service.ts` turns the parsed codelist into these views; the
 * components never read the raw JSON-LD directly.
 */

/** The six systems the POC supports. */
export type SysteemSleutel =
  | 'emissiepunt'
  | 'filter'
  | 'installatie'
  | 'meetpunt'
  | 'uitwisselpunt'
  | 'onttrekkingspunt'

/** One of the six systemen with its two codelists. */
export interface Systeem {
  sleutel: SysteemSleutel
  /** Dutch singular label, e.g. "Installatie". */
  label: string
  /** The type scheme (`conceptscheme:<sleutel>_type`). */
  typeSchemaId: string
  /** The eigenschappen scheme (`conceptscheme:<sleutel>_eigenschappen`). */
  eigenschappenSchemaId: string
  /** Definition of the type scheme, shown under the selector. */
  definitie?: string
}

/** A visible systeemtype, with the hierarchy information the selector needs. */
export interface StructuurType {
  id: string
  systeem: SysteemSleutel
  label: string
  definitie?: string
  /** Parent type id, when the type is a subtype. */
  broader?: string
  /** 0 for a root type, 1 for its children, and so on. */
  diepte: number
  isMeetbaar: boolean
}

/** An option of a selection list (`relevantCodeList`). */
export interface SelectieOptie {
  id: string
  label: string
  definitie?: string
  /** Unit symbol (e.g. `%`, `m`), only for CSOR eenheden. */
  symbool?: string
}

/** A systeemeigenschap (or a composite child) ready for rendering. */
export interface Eigenschap {
  id: string
  label: string
  definitie?: string
  verplicht: boolean
  meervoudig: boolean
  /** XSD type from `relevantDataType`, e.g. `xsd:decimal`. */
  dataType?: string
  /** Id of the selection list (`conceptscheme:*` or `collectie:*`). */
  codeList?: string
  /** Id of the unit concept or unit collection (`csor_eenheid:*` or `collectie:*`). */
  unit?: string
  /** RDFS relation of a composite child (`rdfs:label`, `riepr:parameter`, ...). */
  relatie?: string
  /** RDF predicate the value is stored with (`relevantProperty`, e.g. `dbo:height`). */
  predicaat?: string
  /** `true` when the selection list allows multiple values. */
  multiselect: boolean
  /** Render as a `vl-textarea` instead of a single-line input. */
  multiline?: boolean
  /** Composite children, in source order. Empty for a simple eigenschap. */
  kinderen: Eigenschap[]
}

/** A fixed field of a systeem, generated from `riepr.ttl` (plan 05). */
export interface Systeemveld {
  property: string
  label: string
  verplicht: boolean
  meervoudig: boolean
  datatype: string
  opmerking: string | null
}
