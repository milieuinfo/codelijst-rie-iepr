# Task 06 — Concept-to-Property Mapper

Build the core transformation logic that maps a single SKOS concept (with its RIE-IEPR properties)
to a `SchemaField` representation. This is the heart of the POC: converting declarative codelist
metadata into JSON Schema property definitions.

The mapper operates on individual concepts and produces intermediate `SchemaField` objects. It does
NOT handle composition (grouping, chaining, or schema assembly) — those are separate concerns in
Tasks 09–12. This task focuses purely on the 1:1 mapping of one concept's metadata to schema fields.

## Scope

### Class: `ConceptMapper` (`src/services/concept-mapper.ts`)

```typescript
export class ConceptMapper {
  /**
   * Map a single concept to a SchemaField.
   * @param result - The parsed codelist result for reference resolution
   * @param concept - The concept to map
   * @returns A SchemaField with type, required flag, extensions populated from codelist data
   */
  mapConcept(result: CodelistResult, concept: Concept): SchemaField | null

  /**
   * Derive a property name from a concept ID.
   * Strips the prefix to get the local part, then converts snake_case to camelCase.
   * E.g., 'riepr-operationeel-lucht:brandstof_verbruik' → 'brandstofVerbruik'
   */
  derivePropertyName(concept: Concept): string
}
```

### Mapping Rules

#### Property Name Derivation

- Extract the local part after the last colon in the concept ID (or the full ID if no colon)
- Convert hyphens and underscores to camelCase: `grondstof_hoeveelheid` → `grondstofHoeveelheid`
- If multiple concepts would produce the same property name within a scheme, append a numeric suffix

#### Type Mapping (`relevantDataType`)

| relevantDataType Value | JSON Schema Type | Format |
|---|---|---|
| `xsd:string` | `"string"` | — |
| `xsd:boolean` | `"boolean"` | — |
| `xsd:decimal` | `"number"` | — |
| `xsd:integer` | `"integer"` | — |
| `xsd:date` | `"string"` | `"date"` |
| `xsd:dateTime` | `"string"` | `"date-time"` |
| `dcterms:temporal` | `"string"` | `"date"` |
| `xsd:duration` | `"string"` | — (pattern guidance via description) |
| *(no type set)* | `"object"` | — (composite container for children) |
| *(unknown type)* | `"string"` | — (fallback with warning in logs) |

#### Required Flag (`isVerplicht`)

- `isVerpflicht = "true"` or `isVerpflicht = true` → `isRequired: true`
- All other values → `isRequired: false`

#### Repeatable Flag (`isMeervoudig`)

- `isMeervoudig = "true"` or `isMeervoudig = true` → `isRepeatable: true`
- When repeatable, the field's schema type becomes `"array"` wrapping the inner type

#### Title and Description

- `title`: Use `prefLabel` (Dutch label). Fall back to derived property name.
- `description`: Use `definition`. If absent but `note` exists, use `note`. Otherwise omit.

#### Extensions

Map known x-* extensions from the archived pattern:
- Concepts with `relevantClass = sosa:FeatureOfInterest` get flagged for structural handling
- Store raw `code` value as a potential extension if present

### Null Return Conditions

Return `null` (skip this concept) when:
- The concept has `isOnzichtbaar = true` (hidden concepts should not appear in schemas)
- The concept ID is unresolvable or missing critical fields

### Unit Tests (`src/services/concept-mapper.test.ts`)

```typescript
describe('ConceptMapper', () => {
  it('maps xsd:string to JSON Schema string type', () => { ... })
  it('maps xsd:boolean to boolean type', () => { ... })
  it('maps xsd:decimal to number type', () => { ... })
  it('maps xsd:date to string with date format', () => { ... })
  it('maps xsd:dateTime to string with date-time format', () => { ... })
  it('maps dcterms:temporal to string with date format', () => { ... })
  it('falls back to object type when no relevantDataType set', () => { ... })
  it('sets isRequired from isVerplicht', () => { ... })
  it('sets isRepeatable from isMeervoudig', () => { ... })
  it('derives camelCase property names from snake_case IDs', () => { ... })
  it('uses prefLabel for title and definition for description', () => { ... })
  it('returns null for isOnzichtbaar concepts', () => { ... })
  it('handles duplicate property names within same scheme', () => { ... })

  // Integration tests against real codelist data
  it('maps "Heeft u grondstoffen geproduceerd?" as required boolean field', () => { ... })
  it('maps "Hoeveelheid" as repeatable decimal field', () => { ... })
  it('maps composite concept (no dataType) as object type', () => { ... })
})
```

## Deliverables

1. `src/services/concept-mapper.ts` — Full mapper implementation with all mapping rules
2. `src/services/concept-mapper.test.ts` — Unit tests covering every mapping rule + integration tests

## Definition of Done

- All unit tests pass
- Type mapping covers all observed relevantDataType values in the codelist
- Property name derivation produces valid JSON Schema property identifiers
- Required/repeatable flags are correctly derived from boolean string fields
- Title uses Dutch prefLabel; description uses definition or note
- Hidden concepts (`isOnzichtbaar`) are filtered out
- Duplicate property names get numeric suffixes to avoid collisions
- Unknown types fall back to `"string"` with a console warning
