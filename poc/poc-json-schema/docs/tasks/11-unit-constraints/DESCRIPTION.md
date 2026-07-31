# Task 11 — Unit Constraint Mapping (relevantUnit → hasUnit const/enum)

Build logic that maps a concept's `relevantUnit` property to JSON Schema constraints on the unit
value. Following the archived pattern from `lucht/schema.json`, unit information constrains the
`hasUnit` sub-property within result objects using either `const` (single unit) or `enum` (multiple units).

## Scope

### Class: `UnitConstraintGenerator` (`src/services/unit-constraint-generator.ts`)

```typescript
export interface UnitResolution {
  /** Whether the unit reference was successfully resolved. */
  resolved: boolean
  /** Type of constraint: 'const' for single unit, 'enum' for multiple, 'none' if unresolved. */
  constraintType: 'const' | 'enum' | 'none'
  /** Single unit value when constraintType is 'const'. */
  constValue?: string
  /** Multiple unit values when constraintType is 'enum'. */
  enumValues?: string[]
  /** Warning message if resolution failed. */
  warning?: string
}

export class UnitConstraintGenerator {
  /**
   * Resolve relevantUnit refs on a concept to schema constraints.
   * @param result - Parsed codelist result
   * @param concept - Concept with relevantUnit property set
   * @returns Resolution result describing how to constrain the hasUnit field
   */
  resolveUnits(result: CodelistResult, concept: Concept): UnitResolution

  /**
   * Generate a JSON Schema fragment for constraining a hasUnit property.
   * @param resolution - The unit resolution from resolveUnits()
   * @returns JsonSchemaObject suitable as an allOf entry or properties sub-object
   */
  toSchemaFragment(resolution: UnitResolution): JsonSchemaObject | null
}
```

### Resolution Logic

1. **Single unit ref**: If `relevantUnit` contains one ref that resolves to a known unit URI
   (e.g., `qudt-unit:GigaJ`, `http://qudt.org/vocab/unit/PERCENT`), produce `"const": "<unitUri>"`.

2. **Multiple unit refs**: If `relevantUnit` contains multiple refs, collect all resolved URIs
   and produce `"enum": ["<uri1>", "<uri2>", ...]`.

3. **Scheme-level unit ref**: If the ref points to a `skos:ConceptScheme` rather than a direct
   unit concept, resolve the scheme's top concepts and use their IDs/codes as enum values.

4. **Unresolved units (`http://TODO`)**: Return `{resolved: false, constraintType: 'none',
   warning: "Unit reference http://TODO is unresolved"}`. Do NOT include any unit constraint in
   the generated schema for this field. Log a console warning referencing ISSUE-DATA-01 from ISSUES.md.

5. **External unit refs**: Same treatment as TODO — silently skip with warning.

### Schema Integration Pattern

Following the archived `lucht/schema.json` pattern, unit constraints appear in two places:

**A) Top-level property constraint** (within the domain schema's properties):
```json
{
  "hasResult": {
    "allOf": [
      { "$ref": ".../observatie.json#/properties/hasResult" },
      {
        "type": "object",
        "properties": {
          "hasUnit": { "enum": ["http://qudt.org/vocab/unit/K", "http://qudt.org/vocab/unit/DEG_C"] }
        }
      }
    ]
  }
}
```

**B) Conditional if/then block** (when specific observedProperty values determine the unit):
```json
{
  "if": { "properties": { "observedProperty": { "const": "<propertyId>" } } },
  "then": {
    "properties": {
      "hasResult": {
        "type": "object",
        "properties": {
          "numericValue": { "type": "number", "minimum": 0, "maximum": 100 },
          "hasUnit": { "const": "http://qudt.org/vocab/unit/PERCENT" }
        }
      }
    }
  }
}
```

For this POC, only pattern **A** is implemented. Pattern **B** requires mapping concepts to
specific `observedProperty` enum values, which depends on ISSUE-DESIGN-01 (no SOSA property
mapping in codelist data).

### Known Unit Fields

| Field | Scheme | Unit Ref | Resolvable? |
|---|---|---|---|
| Verbruik (brandstof) | operationeel_lucht_rapportering | `qudt-unit:GigaJ` | Yes — single const |
| Hoeveelheid | operationeel_grondstoffen | `http://TODO` | No — placeholder |
| Verbruik (×2 other) | operationeel_lucht_rapportering | `http://TODO` | No — placeholder |
| Jaarvracht | operationeel_water_lozing | `http://TODO` | No — placeholder |
| Gemiddelde concentratie | operationeel_water_lozing | `http://TODO` | No — placeholder |
| Aantal dagen per jaar | operationeel_water_lozing | `http://TODO` | No — placeholder |
| Totale jaarvracht | operationeel_water_lozing | `http://TODO` | No — placeholder |

Only 1 out of 8 unit fields has a resolvable reference. The rest are documented in ISSUES.md as ISSUE-DATA-01.

### Unit Label Resolution

For units that resolve to local concepts, use the concept's `code` property if available, falling
back to its full ID URI. For QUDT units referenced by short form (`qudt-unit:GigaJ`), expand to
the full URI (`http://qudt.org/vocab/unit/GIGAJ`) if possible via context prefix resolution.

### Unit Tests (`src/services/unit-constraint-generator.test.ts`)

```typescript
describe('UnitConstraintGenerator', () => {
  it('resolves single unit ref to const constraint', () => { ... })
  it('resolves multiple unit refs to enum constraint', () => { ... })
  it('returns none for http://TODO with warning', () => { ... })
  it('generates correct allOf schema fragment for const units', () => { ... })
  it('generates correct allOf schema fragment for enum units', () => { ... })
  it('returns null when no relevantUnit is set on concept', () => { ... })

  // Real data tests
  it('Verbruik (brandstof) resolves qudt-unit:GigaJ to const', () => { ... })
  it('Hoeveelheid (grondstoffen) returns unresolved with TODO warning', () => { ... })
})
```

## Deliverables

1. `src/services/unit-constraint-generator.ts` — Full unit resolution and schema generation
2. `src/services/unit-constraint-generator.test.ts` — Unit tests covering all resolution paths
3. Integration into the field-to-schema pipeline: unit constraints appear in generated output

## Definition of Done

- All unit tests pass against the real codelist data
- Single unit refs produce `"const"` constraints with full URI values
- Multiple unit refs produce `"enum"` constraints
- Unresolved units (`http://TODO`) are skipped gracefully with console warnings
- Schema fragments follow the archived pattern (allOf with hasResult.hasUnit constraint)
- Only resolvable units appear in generated schemas; TODO fields have no unit constraint
- QUDT short-form references are expanded to full URIs where possible
