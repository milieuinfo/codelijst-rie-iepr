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
  propertyName: string
  label: string
  description?: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  isRequired: boolean
  isRepeatable: boolean
  enumValues?: unknown[]
  unitConstraint?: { type: 'const'; value: string } | { type: 'enum'; values: string[] }
  condition?: { path: string; value: string }
  children?: SchemaField[]
  relevantClass?: string
  extensions?: Record<string, unknown>
  broader?: string[]
  narrower?: string[]
  hasUnitConstraint?: { type: 'const'; value: string } | { type: 'enum'; values: string[] }
  hasNumericResult?: boolean
  pattern?: string
  minimum?: number
  maximum?: number
}

export interface AssembledThemeOutput {
  baseSchema: JsonSchemaObject
  domainSchema: JsonSchemaObject
}
