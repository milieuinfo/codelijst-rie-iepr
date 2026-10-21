/**
 * @file CSOR resolution (plan 03).
 *
 * `relevantUnit` and `relevantCodeList` point at CSOR concepts
 * (`csor_eenheid:E_59`, `csor_variabele:V_2217`), sometimes through a
 * `skos:Collection`. CSOR is published separately from the RIE-IEPR codelist;
 * the labels and unit symbols of the concepts this POC needs are generated
 * into `src/generated/csor.json` by `scripts/sync-csor.mjs`.
 *
 * Unknown ids never crash the UI: they fall back to their local name
 * (`E_59`) and log one warning.
 */

import csorData from '../generated/csor.json'
import type { SelectieOptie } from '../models/index.js'

export interface CsorConcept {
  label: string
  definition?: string
  /** `csor:symbool`, only for eenheden (e.g. "mg/L"). */
  symbol?: string
  /** `skos:notation` (e.g. "E_59"). */
  notation?: string
  deprecated?: boolean
}

export type CsorData = Record<string, CsorConcept>

/** The generated subset; typed here so components do not depend on the JSON shape. */
export const CSOR: CsorData = csorData as CsorData

/**
 * Resolves CSOR CURIEs against the generated subset.
 */
export class CsorService {
  private readonly warned = new Set<string>()

  constructor(private readonly data: CsorData = CSOR) {}

  /**
   * Looks up one CSOR concept.
   * @param id - A CSOR CURIE such as `csor_eenheid:E_59`.
   * @returns The concept, or undefined when it is not in the generated subset.
   */
  resolveConcept(id: string): CsorConcept | undefined {
    return this.data[id]
  }

  /**
   * Resolves a CSOR id to the label shown next to a selection list.
   * @param id - A CSOR CURIE.
   * @returns The CSOR label, or the local name when the id is unknown.
   */
  resolveLabel(id: string): string {
    const concept = this.data[id]
    if (concept?.label) return concept.label
    this.warnOnce(id)
    return localName(id)
  }

  /**
   * Resolves a unit to its display label: the symbol when there is one, else the label.
   * @param id - A `csor_eenheid:*` CURIE.
   * @returns The symbol or label, or the local name when the id is unknown.
   */
  resolveUnitLabel(id: string): string {
    const concept = this.data[id]
    if (concept) return concept.symbol ?? concept.label
    this.warnOnce(id)
    return localName(id)
  }

  /**
   * Turns CSOR ids into selection options, sorted alphabetically on label.
   * @param ids - CSOR CURIEs.
   * @returns The options with label, definition and symbol.
   */
  resolveOptions(ids: string[]): SelectieOptie[] {
    return ids
      .map((id) => ({
        id,
        label: this.resolveLabel(id),
        definitie: this.data[id]?.definition,
        symbool: this.data[id]?.symbol,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'nl'))
  }

  /**
   * Resolves the members of a CSOR collection (e.g. `collectie:vermogen_eenheden`).
   * @param memberIds - Member ids, in source order.
   * @returns The options, alphabetically on label.
   */
  resolveCollection(memberIds: string[]): SelectieOptie[] {
    return this.resolveOptions(memberIds)
  }

  /**
   * Logs one warning per unknown id instead of crashing or spamming the console.
   * @param id - The unresolved CSOR CURIE.
   */
  private warnOnce(id: string): void {
    if (this.warned.has(id)) return
    this.warned.add(id)
    console.warn(`[csor] Onbekend CSOR-concept "${id}" — lokale naam wordt getoond.`)
  }
}

/**
 * Returns the part after the colon (`csor_eenheid:E_59` → `E_59`).
 * @param id - A CURIE or IRI.
 * @returns The local name.
 */
export function localName(id: string): string {
  const hash = id.lastIndexOf('#')
  const slash = id.lastIndexOf('/')
  const colon = id.lastIndexOf(':')
  return id.slice(Math.max(hash, slash, colon) + 1)
}
