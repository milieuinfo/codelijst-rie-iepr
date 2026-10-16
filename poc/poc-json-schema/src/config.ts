/**
 * Runtime configuration for the transformation pipeline.
 * Keep all domain-specific constants here — no hardcoded values in services.
 */

export interface TransformConfig {
  /** Pattern (substring) to match the theme typescheme ID. */
  readonly themeSchemePattern: string

  /** Known external/unresolvable relevantCodeList prefixes. */
  readonly externalDomainPrefixes: readonly string[]

  /** Placeholder URI markers that indicate missing data. */
  readonly placeholderMarkers: readonly string[]

  /** Base URL for generated JSON Schema references. */
  readonly baseSchemaUrl: string

  /** Year used in $id URLs. */
  readonly schemaYear: number

  /** relevantClass values of a single-observation composite (sub-schema). */
  readonly observationClasses: readonly string[]

  /** relevantClass values of an observation-collection composite (collection envelope). */
  readonly collectionClasses: readonly string[]
}

export const config: TransformConfig = {
  themeSchemePattern: 'thema',
  externalDomainPrefixes: [
    'https://vito.be',
    'conceptscheme-alg:',
  ],
  placeholderMarkers: ['TODO'],
  baseSchemaUrl: 'https://data.riepr.omgeving.vlaanderen.be/schema/2026/observatie',
  schemaYear: 2026,
  observationClasses: ['riepr:Observatie', 'sosa:Observation'],
  collectionClasses: ['riepr:ObservatieVerzameling', 'sosa:ObservationCollection'],
}

/** Whether a relevantClass marks an observation collection composite. */
export function isCollectionClass(relevantClass: string | undefined): boolean {
  return !!relevantClass && config.collectionClasses.includes(relevantClass)
}

/** Whether a relevantClass marks an observation (or observation collection) composite. */
export function isObservationClass(relevantClass: string | undefined): boolean {
  return !!relevantClass && (config.observationClasses.includes(relevantClass) || isCollectionClass(relevantClass))
}
