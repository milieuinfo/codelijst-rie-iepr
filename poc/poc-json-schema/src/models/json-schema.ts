export interface JsonSchemaObject {
  $schema?: string
  $id?: string
  description?: string
  title?: string
  type?: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'integer' | 'null'
  properties?: Record<string, JsonSchemaValue>
  required?: string[]
  additionalProperties?: boolean
  allOf?: JsonSchemaValue[]
  if?: JsonSchemaObject
  then?: JsonSchemaObject
  else?: JsonSchemaObject
  items?: JsonSchemaValue
  enum?: unknown[]
  const?: unknown
  format?: string
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  default?: unknown
  [key: string]: unknown
}

export type JsonSchemaValue = JsonSchemaObject | string

export interface SchemaField {
  /** Original SKOS concept ID (e.g. "riepr-operationeel-lucht:feature_ep") */
  conceptId: string
  propertyName: string
  label: string
  description?: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  isRequired: boolean
  isRepeatable: boolean
  enumValues?: unknown[]
  condition?: { path: string; value: string }
  children?: SchemaField[]
  relevantClass?: string
  extensions?: Record<string, unknown>
  /** Unit constraint derived from relevantUnit on the concept */
  hasUnitConstraint?: { type: 'const'; value: string } | { type: 'enum'; values: string[] }
  /** Whether the concept carries a numeric result (xsd:decimal / xsd:integer) */
  hasNumericResult?: boolean
  pattern?: string
  minimum?: number
  maximum?: number
  isPartOf?: string[]
  narrower?: string[]
  isFeatureOfInterest?: boolean
  /** Whether this concept maps into hasResult (sosa:hasResult relation) */
  isHasResult?: boolean
  /** Whether this concept is the observed property (sosa:observedProperty) */
  isObservedProperty?: boolean
  /** Whether this concept indicates the procedure used (sosa:usedProcedure) */
  isUsedProcedure?: boolean
  /** Whether this concept indicates the sensor/agent (sosa:madeBySensor) */
  isMadeBySensor?: boolean
  /** Whether this concept is result time (sosa:resultTime) */
  isResultTime?: boolean
  /** Whether this concept is phenomenon time (sosa:phenomenonTime) */
  isPhenomenonTime?: boolean
  /** Whether this concept maps to a simple literal result (sosa:hasSimpleResult) */
  isSimpleResult?: boolean
  /** Expanded predicate URI from concept's relation (e.g. sosa:usedProcedure → http://www.w3.org/ns/sosa/usedProcedure) */
  relationUri?: string
}

export interface SubSchema {
  name: string
  schema: JsonSchemaObject
}

export interface AssembledThemeOutput {
  baseSchema: JsonSchemaObject
  domainSchema: JsonSchemaObject
  subSchemas?: SubSchema[]
}
