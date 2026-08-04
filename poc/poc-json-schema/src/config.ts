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
}
