/**
 * A SKOS conceptscheme: the type scheme (`<systeem>_type`), the eigenschappen
 * scheme (`<systeem>_eigenschappen`) or an inline selection list
 * (`conceptscheme:lozingspunt_lozingsplaats`, ...).
 */
export interface Scheme {
  id: string
  type?: string[]
  prefLabel?: string
  definition?: string
  note?: string
}
