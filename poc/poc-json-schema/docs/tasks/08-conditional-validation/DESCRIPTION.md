# Task 08 — Conditional Validation Generator

Build logic that transforms `conditionPath` / `conditionValue` annotations on concepts into JSON
Schema Draft 2020-12 `if/then` conditional validation blocks. This enables schemas to express rules
like: "show the grondstof fields only when geproduceerd is true".

## Scope

### Class: `ConditionalValidatorGenerator` (`src/services/conditional-validator.ts`)

```typescript
export interface ConditionBlock {
  /** The property name of the trigger field (derived from conditionPath). */
  triggerProperty: string
  /** The value the trigger must match for this field to be valid. */
  triggerValue: string
  /** The property name of the conditioned field itself. */
  conditionedProperty: string
}

export class ConditionalValidatorGenerator {
  /**
   * Collect all conditional fields from a set of SchemaFields.
   * @param fields - Array of mapped schema fields
   * @returns Array of condition blocks describing if/then relationships
   */
  collectConditions(fields: SchemaField[]): ConditionBlock[]

  /**
   * Generate an if/then JSON Schema object for a single condition block.
   * @param condition - The condition block to convert
   * @returns JsonSchemaObject with if/then structure matching Draft 2020-12
   */
  generateIfThen(condition: ConditionBlock): JsonSchemaObject

  /**
   * Generate all if/then blocks for a theme's fields and return as an allOf array entry.
   * @param conditions - All condition blocks for this theme
   * @returns JsonSchemaObject suitable for inclusion in the parent schema's allOf array
   */
  generateAllConditionals(conditions: ConditionBlock[]): JsonSchemaObject | null
}
```

### Mapping Logic

#### From Codelist to Condition Block

A concept with `conditionPath` and `conditionValue`:
- `conditionPath` points to another concept ID (the trigger field)
- `conditionValue` is the value that must match (already normalized by the parser, e.g., `"true"` or `"riepr-operationeel-pomptoestand:rust"`)

The mapper derives the trigger property name from the target concept's ID using the same
derivation logic as Task 06 (`derivePropertyName`).

#### If/Then Structure

Following the archived `lucht/schema.json` pattern, each conditional becomes an `allOf` entry:

```json
{
  "if": {
    "properties": {
      "<triggerProperty>": { "const": "<triggerValue>" }
    }
  },
  "then": {
    "properties": {
      "<conditionedProperty>": { ...field definition... }
    }
  }
}
```

Note: The archived example uses `if/then` for observedProperty-specific constraints. For our
conditional fields, we use a slightly different pattern where the trigger IS a form field rather
than an enum discriminator. Both patterns are valid Draft 2020-12.

#### Multiple Conditions

When multiple conditions exist in the same theme (e.g., Grondwater has 3 conditional fields),
each gets its own `if/then` block within the same `allOf` array. They are independent — one
condition being met does not affect another.

### Known Conditional Fields (from codelist analysis)

| Conditioned Field | Trigger Field | Trigger Value | Scheme |
|---|---|---|---|
| Grondstof | geproduceerd | `"true"` | operationeel_grondstoffen |
| Duur pompen stil | pomptoestand | `"riepr-operationeel-pomptoestand:rust"` | operationeel_grondwater |
| Volume (8u voor stilstand) | pomptoestand | `"riepr-operationeel-pomptoestand:rust"` | operationeel_grondwater |
| Volume (1 uur voor meting) | pomptoestand | `"riepr-operationeel-pomptoestand:werking"` | operationeel_grondwater |

### Unit Tests (`src/services/conditional-validator.test.ts`)

```typescript
describe('ConditionalValidatorGenerator', () => {
  it('collects condition blocks from fields with condition set', () => { ... })
  it('generates valid if/then structure for a single condition', () => { ... })
  it('generates multiple if/then entries in allOf for multiple conditions', () => { ... })
  it('derives trigger property name from conditionPath concept ID', () => { ... })
  it('returns null when no conditions exist', () => { ... })
  it('handles conditionValue as normalized string ("true")', () => { ... })
  it('handles conditionValue as full URI ref ("riepr-...:rust")', () => { ... })

  // Real data tests
  it('produces correct if/then for Grondstof → geproduceerd = true', () => { ... })
  it('produces two separate if/then blocks for pomptoestand rust vs werking', () => { ... })
})
```

## Deliverables

1. `src/services/conditional-validator.ts` — Full conditional validation generator
2. `src/services/conditional-validator.test.ts` — Unit tests covering all patterns
3. Generated if/then blocks are valid Draft 2020-12 JSON Schema (verifiable via ajv)

## Definition of Done

- All unit tests pass
- Conditional fields from the real codelist produce correct if/then structures matching the table above
- Multiple independent conditions generate separate allOf entries (not nested)
- Trigger property names match the derived camelCase names from Task 06
- Condition values use the parser-normalized strings (e.g., `"true"` not `"concept:true"`)
- Returns null when no conditions exist in a theme's field set
- Generated schemas validate correctly against ajv with Draft 2020-12 meta-schema
