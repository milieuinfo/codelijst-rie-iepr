# Task 10 — Array Handling (isMeervoudig → type array with items)

Build logic that wraps repeatable fields (`isMeervoudig = true`) in JSON Schema `"type": "array"`
constructs with appropriate `items` definitions. This handles both simple repeatable scalar fields
and repeatable composite objects (which combine with Task 09's nesting).

## Scope

### Logic Location

This logic is integrated into `CompositeGroupBuilder.toSchemaProperties()` (Task 09) and
`ConceptMapper.mapConcept()` (Task 06), since array wrapping affects how a field is rendered at
both the mapping and composition stages.

### Wrapping Rules

#### Simple Repeatable Fields

A leaf field with `isMeervoudig = true` but no children:

```json
{
  "referentiepunt": {
    "type": "array",
    "items": {
      "type": "string",
      "title": "Referentiepunt",
      "description": "..."
    }
  }
}
```

#### Composite Repeatable Fields

A composite field with `isMeervoudig = true` AND narrower children:

```json
{
  "grondstof": {
    "type": "array",
    "items": {
      "type": "object",
      "required": ["bestemmingType", ...],
      "properties": { /* nested child properties */ }
    }
  }
}
```

The `items` schema contains exactly what the non-repeatable version would be — just wrapped in an
array container.

#### minItems Derivation

When both `isMeervoudig = true` AND `isVerplicht = true`, derive `"minItems": 1` on the array.
This ensures that a required repeatable field must have at least one entry.

| isMeervoudig | isVerplicht | Schema Output |
|---|---|---|
| false | false | Leaf type, not in required[] |
| false | true | Leaf type, in parent's required[] |
| true | false | Array items, no minItems, not in required[] |
| true | true | Array items + minItems:1, in parent's required[] |

### Known Repeatable Concepts (23 total)

Key ones affecting operationeel schemes:

| Concept | Scheme | Composite? | Required? |
|---|---|---|---|
| Grondstof | operationeel_grondstoffen | Yes (6 children) | No |
| Peilmeting | operationeel_grondwater | Yes | No |
| Kwaliteitsmeting | operationeel_grondwater | Yes | No |
| Onttrekking/infiltratie | operationeel_grondwater | Yes | No |
| Referentiepunt | operationeel_grondwater | No | Yes → minItems:1 |
| Afvalproduct | operationeel_lucht_rapportering | Yes | No |
| Verbruikte brandstof | operationeel_lucht_rapportering | Yes | No |
| Geproduceerde stof | operationeel_lucht_rapportering | Yes | No |
| Verbruikte stof | operationeel_lucht_rapportering | Yes | No |
| Controleinrichting | operationeel_water | Yes | Yes → minItems:1 |
| Lozing | operationeel_water_lozing | Yes | No |
| Abnormale lozing | operationeel_water_lozing | Yes | No |
| Meting | operationeel_zelfcontrole_*_meting | Yes | No |
| Parameter | operationeel_zelfcontrole_*_meting | Yes | No |

### Integration with Composite Grouping (Task 09)

The array wrapping happens AFTER composite grouping. The flow is:

1. Mapper produces flat SchemaFields for all concepts in a scheme
2. CompositeGroupBuilder groups children under parents via broader/narrower
3. Array wrapping wraps the final structure based on `isRepeatable` flag

This order matters because the repeatable wrapper goes around the complete object, including its nested properties.

### Unit Tests (`src/services/array-handler.test.ts`)

```typescript
describe('Array Handling', () => {
  it('wraps simple repeatable field in type array with items', () => { ... })
  it('wraps composite repeatable field — items contains object with properties', () => { ... })
  it('adds minItems:1 when both isMeervoudig and isVerplicht are true', () => { ... })
  it('does NOT add minItems when only isMeervoudig is true', () => { ... })
  it('does NOT wrap non-repeatable fields even if required', () => { ... })
  it('repeatable + conditional fields produce correct combined schema', () => { ... })

  // Real data tests
  it('Grondstof produces array of objects with 6 child properties', () => { ... })
  it('Referentiepunt (grondwater) produces string array with minItems:1', () => { ... })
})
```

## Deliverables

1. Array wrapping logic integrated into existing services (ConceptMapper + CompositeGroupBuilder)
2. `src/services/array-handler.test.ts` — Dedicated test file for array handling scenarios
3. Updated `toSchemaProperties()` method handles the repeatable flag correctly

## Definition of Done

- All unit tests pass
- Repeatable leaf fields render as `"type": "array"` with scalar items
- Repeatable composite fields render as `"type": "array"` with object items containing nested properties
- `minItems: 1` present only on fields where both isMeervoudig AND isVerplicht are true
- Non-repeatable fields remain unwrapped regardless of required status
- The 4-way truth table (isMeervoudig × isVerplicht) produces correct output in all cases
- Integration with Task 09's nesting works correctly — children appear inside items.properties, not outside
