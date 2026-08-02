# Task 11 — Unit Value Mapping (relevantUnit → hasResult.hasUnit)

Map a concept's `relevantUnit` property directly to the `hasUnit` value in generated schemas.
This is **not** a "unit constraint derivation" step — it's a straightforward value mapping:
the selected relevantUnit URI becomes the hasUnit value (`const` for single, `enum` for multiple).

Additionally, when a field has a numeric `relevantDataType` (`xsd:decimal`, `xsd:integer`),
a `numericValue` sub-property of type `number` is automatically implied within `hasResult`.
No extra annotation needed beyond the type declaration.

## Scope

### Logic Location (folded into ConceptMapper, Task 06)

This task's logic is **not a separate service** — it is folded directly into `ConceptMapper.mapConcept()`
(Task 06). When mapping a concept that carries `relevantUnit` and/or a numeric type:

1. If `relevantDataType` is numeric (`xsd:decimal`, `xsd:integer`) → automatically generate
   `hasResult.numericValue` as type `number`. No extra annotation needed; implied by the type.
2. If `relevantUnit` is present → map its resolved URI(s) directly to `hasResult.hasUnit`:
   - Single unit → `"const": "<unitUri>"`
   - Multiple units → `"enum": ["<uri1>", "<uri2>"]`
3. Unresolved units (`http://TODO`) → skip gracefully with console warning (ISSUE-DATA-01)

```typescript
// In SchemaField model (Task 02), add:
export interface SchemaField {
  // ... existing properties ...
  /** When relevantUnit resolves successfully: hasUnit constraint for hasResult object. */
  hasUnitConstraint?: { type: 'const'; value: string } | { type: 'enum'; values: string[] }
  /** Whether this field implies hasResult.numericValue (true for xsd:decimal, xsd:integer). */
  hasNumericResult?: boolean
}
```

### Resolution Logic

The mapping is straightforward — no complex derivation:

1. **Numeric type implies hasResult.numericValue**: When a concept has `relevantDataType`
   of `xsd:decimal`, `xsd:integer`, or similar numeric types, the mapper sets
   `hasNumericResult = true`. This means the generated schema will include `hasResult.numericValue`
   as type `number`. No extra annotation on the concept needed; it's implied by the data type.

2. **Single relevantUnit → const**: If `relevantUnit` contains one resolvable URI (e.g.,
   `qudt-unit:GigaJ`), produce `"const": "<expandedUri>"` on the `hasResult.hasUnit` property.

3. **Multiple relevantUnits → enum**: Collect all resolved URIs and produce
   `"enum": ["<uri1>", "<uri2>"]`.

4. **Unresolved units (`http://TODO`)**: Skip gracefully with console.warn. Do NOT include any
   hasUnit constraint for this field. Reference ISSUE-DATA-01 from ISSUES.md.

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
