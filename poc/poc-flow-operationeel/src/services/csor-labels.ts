/**
 * @file Local labels for the CSOR concepts the RIE-IEPR codelist refers to.
 *
 * CSOR (eenheden, variabelen, kwantificeerbare aspecten, dragers, soorten
 * waardebepaling) is published separately on data.omgeving.vlaanderen.be; the
 * codelist only carries the CURIEs (e.g. `csor_eenheid:E_1`, or the members of a
 * `skos:Collection` such as `collectie:operationeel_stoffen_water`). The POC
 * has no backend, so the labels (skos:prefLabel) and unit symbols
 * (csor:symbool) of the referenced concepts are kept here.
 *
 * Fetched from https://data-ontwikkel.omgeving.vlaanderen.be/sparql. Extend when
 * new CSOR concepts appear in the codelist; unknown ids fall back to their
 * local name (`E_1`, `V_46`).
 */

export interface CsorLabel {
  label: string
  /** csor:symbool, only for eenheden (e.g. "mg/L"). */
  symbol?: string
}

export const CSOR_LABELS: Record<string, CsorLabel> = {
  // --- eenheden ---
  'csor_eenheid:E_1': { label: 'milligram per liter', symbol: 'mg/L' },
  'csor_eenheid:E_12': { label: 'kilogram per jaar', symbol: 'kg/jr' },
  'csor_eenheid:E_13': { label: 'kilogram per uur', symbol: 'kg/u' },
  'csor_eenheid:E_32': { label: 'kubieke meter', symbol: 'm³' },
  'csor_eenheid:E_43': { label: 'procent', symbol: '%' },
  'csor_eenheid:E_50': { label: 'kubieke meter per jaar', symbol: 'm³/jr' },
  'csor_eenheid:E_59': { label: 'meter', symbol: 'm' },
  'csor_eenheid:E_62': { label: 'graden Celsius', symbol: '°C' },
  'csor_eenheid:E_83': { label: 'aantal', symbol: '#' },
  'csor_eenheid:E_89': { label: 'gigajoule', symbol: 'GJ' },
  'csor_eenheid:E_92': { label: 'megawatt', symbol: 'MW' },
  'csor_eenheid:E_94': { label: 'uur', symbol: 'u' },

  // --- kwantificeerbare aspecten ---
  'csor_kwantificeerbaaraspect:KWA_1': { label: 'massaconcentratie' },
  'csor_kwantificeerbaaraspect:KWA_2': { label: 'vracht per tijd' },
  'csor_kwantificeerbaaraspect:KWA_7': { label: 'percentage' },
  'csor_kwantificeerbaaraspect:KWA_73': { label: 'massaconcentratie (Nm³)' },

  // --- dragers ---
  'csor_drager:DR_1': { label: 'water' },
  'csor_drager:DR_8': { label: 'lucht' },

  // --- soorten waardebepaling ---
  'csor_soortwaardebepaling:SWB_1': { label: 'standaard' },
  'csor_soortwaardebepaling:SWB_40': { label: 'standaard deviatie' },

  // --- variabelen (stoffen / parameters) ---
  'csor_variabele:V_46': { label: 'Fosfor' },
  'csor_variabele:V_231': { label: 'Stikstof' },
  'csor_variabele:V_246': { label: 'Chloride' },
  'csor_variabele:V_247': { label: 'Nitraat' },
  'csor_variabele:V_251': { label: 'Sulfaat' },
  'csor_variabele:V_316': { label: 'Zwevende stoffen' },
  'csor_variabele:V_321': { label: 'Ammonium' },
  'csor_variabele:V_329': { label: 'Arseen' },
  'csor_variabele:V_333': { label: 'Cadmium' },
  'csor_variabele:V_337': { label: 'Ijzer' },
  'csor_variabele:V_351': { label: 'Zink' },
  'csor_variabele:V_424': { label: 'Chemisch zuurstofverbruik' },
  'csor_variabele:V_1057': { label: 'Stikstofoxiden' },
  'csor_variabele:V_1060': { label: 'Methaan' },
  'csor_variabele:V_1096': { label: 'Dichlooretheen' },
  'csor_variabele:V_1685': { label: 'Koolstofmonoxide' },
  'csor_variabele:V_1686': { label: 'Koolstofdioxide' },
  'csor_variabele:V_1901': { label: 'PM10' },
  'csor_variabele:V_1919': { label: 'Zwaveldioxide' },
  'csor_variabele:V_2217': { label: 'Zoutzuur' },
}

/**
 * Resolves a CSOR id to its prefLabel.
 * @param id - A CSOR CURIE such as `csor_variabele:V_46`.
 * @returns The label, or undefined when the id is not known locally.
 */
export function resolveCsorLabel(id: string): string | undefined {
  return CSOR_LABELS[id]?.label
}

/**
 * Resolves a CSOR eenheid id to its symbol, falling back to its label.
 * @param id - A CSOR CURIE such as `csor_eenheid:E_1`.
 * @returns The symbol or label, or undefined when the id is not known locally.
 */
export function resolveCsorUnitSymbol(id: string): string | undefined {
  const entry = CSOR_LABELS[id]
  return entry?.symbol ?? entry?.label
}
