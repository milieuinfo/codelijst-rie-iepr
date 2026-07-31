# Task 02 — Data Models

Define TypeScript interfaces for both the **input side** (SKOS/JSON-LD codelist structures) and the
**output side** (JSON Schema Draft 2020-12 structures). These models serve as the contract between
the parser service and the schema generation logic.

## Scope

### Input Models (`src/models/codelist.ts`)

Based on the SKOS concepts used in `rie-iepr.jsonld`. Study the actual JSON-LD data structure and
the `skos-models.ts` from poc-flow-operationeel for reference, but create standalone definitions
here. Do not import from the other POC.

```typescript
/** Raw JSON-LD node as it appears in the rie-iepr.jsonld graph. */
export type JsonLdNode = Record<string, unknown>

/** Result of parsing the full codelist document. */
export interface CodelistResult {
  /** Every node indexed by id, merged across all sightings in the document. */
  nodesById: Map<string, JsonLdNode>
  /** Concept schemes keyed by id. */
  schemes: Map<string, Scheme>
  /** Concepts keyed by id. */
  concepts: Map<string, Concept>
  /** Top-level concepts per scheme (resolved from hasTopConcept refs). */
  topConcepts: Map<string, Concept[]>
}

/** A SKOS concept with RIE-IEPR extension properties. */
export interface Concept {
  id: string
  type?: string[]
  inScheme?: string
  code?: string
  prefLabel?: string
  altLabel?: string[]
  definition?: string
  note?: string
  broader?: string[]
  narrower?: string[]
  topConceptOf?: string

  // RIE-IEPR specific properties
  isVerplicht?: boolean | string
  isMeervoudig?: boolean | string
  isMeetbaar?: boolean | string
  isOnzichtbaar?: boolean | string
  isMultiselect?: boolean | string
  relevantDataType?: string
  relevantCodeList?: string[]
  relevantRiepr?: string[]
  relevantUnit?: string[]
  relevantProperty?: string
  relevantClass?: string
  conditionPath?: string
  conditionValue?: string
  seeAlso?: string[]
}

/** A SKOS concept scheme. */
export interface Scheme {
  id: string
  type?: string[]
  prefLabel?: string
  definition?: string
  note?: string
  relevantRiepr?: string[]
  seeAlso?: string[]
}
```

### Output Models (`src/models/json-schema.ts`)

TypeScript interfaces representing JSON Schema Draft 2020-12 structures. These should be sufficient
to construct schemas programmatically without needing raw object spread hacks.

```typescript
/** Base JSON Schema object (Draft 2020-12). */
export interface JsonSchemaObject {
  $schema?: string
  $id?: string
  description?: string
  title?: string
  type?: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'null'
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
  [key: string]: unknown  // Allow x-* extensions and other keywords
}

/** A JSON schema value — either a full schema or a $ref string. */
export type JsonSchemaValue = JsonSchemaObject | string

/** Intermediate representation of a field being mapped to schema. */
export interface SchemaField {
  /** Property name in the generated JSON Schema (derived from concept id local part). */
  propertyName: string
  /** Display label for title/description fields. */
  label: string
  /** Optional description text. */
  description?: string
  /** Base JSON Schema type. */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  /** Whether this field is required. */
  isRequired: boolean
  /** Whether this field can repeat (isMeervoudig). */
  isRepeatable: boolean
  /** Enum values if derived from relevantCodeList. */
  enumValues?: unknown[]
  /** Unit constraint for numeric fields. */
  unitConstraint?: { type: 'const'; value: string } | { type: 'enum'; values: string[] }
  /** Conditional visibility rule. */
  condition?: { path: string; value: string }
  /** Child fields for composite concepts (narrower children). */
  children?: SchemaField[]
  /** SOSA class annotation (informational). */
  relevantClass?: string
  /** x-* extensions to include (e.g., x-ui-first, x-jsonld-id). */
  extensions?: Record<string, unknown>
}

/** A complete generated theme schema ready for serialization. */
export interface ThemeSchemaOutput {
  /** The base observatie schema content. */
  baseSchema: JsonSchemaObject
  /** Per-theme domain schemas keyed by theme name. */
  domainSchemas: Map<string, JsonSchemaObject>
}
```

### Utility Types (`src/models/index.ts`)

Re-export all models from a single barrel file:

```typescript
export * from './codelist.js'
export * from './json-schema.js'
```

## Deliverables

1. `src/models/codelist.ts` — Input-side interfaces matching the SKOS/JSON-LD structure
2. `src/models/json-schema.ts` — Output-side interfaces for JSON Schema Draft 2020-12 generation
3. `src/models/index.ts` — Barrel re-export
4. All types compile cleanly under `tsc --noEmit`

## Definition of Done

- All interfaces are exported and type-check correctly
- `JsonSchemaObject` covers all keywords needed by the archived reference schemas ($ref, allOf, if/then, enum, const, minimum, maximum)
- `SchemaField` captures every codelist property that influences schema generation
- No circular dependencies between model files
- `npm run build` passes with zero TypeScript errors
