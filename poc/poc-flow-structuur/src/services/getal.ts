/**
 * @file Getalnotatie voor numerieke eigenschappen (plan 06).
 *
 * Zoals MJV: de gebruiker typt een komma als decimaalteken (`12,5`); de waarde
 * blijft in het formulier een string. Er wordt niets opgeslagen, dus er is geen
 * conversie naar een RDF-literal nodig.
 */

/** Geheel getal, optioneel negatief. */
export const INTEGER_REGEX = /^-?\d+$/

/** Decimaal getal met komma als decimaalteken, optioneel negatief. */
export const DECIMAAL_REGEX = /^-?\d+(,\d+)?$/

/**
 * Bepaalt of een XSD-type numeriek is.
 * @param dataType - Het `relevantDataType` van de eigenschap.
 * @returns `integer`, `decimal` of undefined.
 */
export function getalType(dataType?: string): 'integer' | 'decimal' | undefined {
  if (!dataType) return undefined
  if (dataType === 'xsd:integer' || dataType === 'xsd:int' || dataType === 'xsd:long') return 'integer'
  if (['xsd:decimal', 'xsd:double', 'xsd:float'].includes(dataType)) return 'decimal'
  return undefined
}
