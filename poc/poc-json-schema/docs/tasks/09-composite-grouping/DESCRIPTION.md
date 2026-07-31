# Task 09 — Composite Grouping (broader/narrower → Nested Properties)

Build logic that groups child concepts under their parent composite using `broader` / `narrower`
relationships. In the codelist, a composite concept has children linked via `narrower`, and each
child references its parent via `broader`. The transformation nests these as sub-properties within
a JSON Schema object type.

## Scope

### Class: `CompositeGroupBuilder` (`src/services/composite-group-builder.ts`)

```typescript
export class CompositeGroupBuilder {
  /**
   * Build nested property structures from flat field lists.
   * Groups fields with 'broader' refs under their parent's children array.
   * @param result - Parsed codelist for concept lookups
   * @param rootFields - Array of top-level SchemaFields (no broader ref)
   * @returns Same array with children populated on composite parents
   */
  buildNestedStructure(result: CodelistResult, rootFields: SchemaField[]): SchemaField[]

  /**
   * Get all child concepts for a given concept ID, mapped to SchemaFields.
   * Uses narrower relationships from the source concept.
   * @param result - Parsed codelist
   * @param parentId - Concept ID whose children to find
   * @param mapper - ConceptMapper instance for mapping children
   * @returns Array of child SchemaFields sorted by definition order
   */
  getChildFields(
    result: CodelistResult,
    parentId: string,
    mapper: ConceptMapper,
  ): SchemaField[]

  /**
   * Convert a nested SchemaField tree into JSON Schema properties object.
   * Handles required arrays at each nesting level independently.
   * @param fields - Root-level schema fields with children populated
   * @returns { properties, required } tuple for the parent object
   */
  toSchemaProperties(fields: SchemaField[]): { properties: Record<string, JsonSchemaValue>; required: string[] }
}
```

### Grouping Logic

1. **Identify root fields**: Fields without `broader` set are top-level entries in the operationeel scheme.

2. **Collect children**: For each root field that has `narrower` refs (or is identified as composite
   because other fields have it as their broader), look up all narrower concepts and map them using
   `ConceptMapper.mapConcept()`.

3. **Populate children array**: Store mapped child fields in `parentField.children`. Children retain
   their own `isRequired`, `isRepeatable`, type, enumValues, etc.

4. **Nested toSchema conversion**: When converting the field tree to JSON Schema:
   - A composite field (with children) becomes `"type": "object"` with its own `properties` map
     containing the children
   - Each child's sub-properties appear under the parent's `properties.<childPropertyName>`
   - The parent's `required` array includes only direct children marked `isVerplicht`
   - Required arrays are computed independently at each nesting level

5. **Flat fields** (no children): Render directly as leaf properties with their derived type/format/enum.

### Example: Grondstoffen → Grondstof Composite

```
Root field: "Heeft u grondstoffen geproduceerd?"  → boolean, required=false
Root field: "Grondstof"                            → object (composite, repeatable)
  ├─ "Bestemming type"                             → string, enum from codeList
  ├─ "Hoeveelheid"                                 → number, unit=http://TODO
  ├─ "Materiaalcode"                               → string, enum=[] (unresolved ref)
  ├─ "Omschrijving"                                → string, required=false
  ├─ "Opmerking"                                   → string, required=false
  └─ "Toepassingswijze"                            → string, enum from codeList
```

In JSON Schema this becomes:

```json
{
  "properties": {
    "heeftUGrondstoffenGeproduceerd": { "type": "boolean", ... },
    "grondstof": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["bestemmingType", "hoeveelheid", "toepassingswijze"],
        "properties": {
          "bestemmingType": { "type": "string", "enum": [...], ... },
          "hoeveelheid": { "type": "number", ... },
          "materiaalcode": { "type": "string", ... },
          "omschrijving": { "type": "string", ... },
          "opmerking": { "type": "string", ... },
          "toepassingswijze": { "type": "string", "enum": [...], ... }
        }
      }
    }
  }
}
```

### Handling Duplicate Property Names

When multiple composite parents have children with the same local name (e.g., both `Afvalproduct`
and `Verbruikte brandstof` in `operationeel_lucht_rapportering` have a child named `Naam` and
`Aard`), the mapper's property name deduplication (Task 06) applies within each parent's scope.
Children of different parents can share names since they're namespaced under different parent keys.

### Unit Tests (`src/services/composite-group-builder.test.ts`)

```typescript
describe('CompositeGroupBuilder', () => {
  it('identifies root fields as those without broader refs', () => { ... })
  it('groups narrower children under their broader parent', () => { ... })
  it('converts composite fields to object type with nested properties', () => { ... })
  it('computes required array independently at each nesting level', () => { ... })
  it('handles flat fields (no children) as leaf types', () => { ... })
  it('preserves child field metadata (type, enum, condition)', () => { ... })
  it('handles duplicate child names across different parents', () => { ... })

  // Real data tests
  it('builds correct grondstof composite with 6 children', () => { ... })
  it('builds correct afvalproduct/brandstof/stof composites from lucht_rapportering', () => { ... })
})
```

## Deliverables

1. `src/services/composite-group-builder.ts` — Full grouping and nesting implementation
2. `src/services/composite-group-builder.test.ts` — Unit tests covering all patterns

## Definition of Done

- All unit tests pass against the real codelist data
- Composite concepts correctly nest their narrower children as sub-properties
- Required arrays are computed per-nesting-level (not inherited from root)
- Flat fields render directly without unnecessary object wrapping
- Duplicate child names within the same parent get numeric suffix deduplication
- The grondstof example produces a structure matching the JSON Schema shown above
- Nested properties preserve all child metadata: type, format, enum values, conditions, repeatable flag
