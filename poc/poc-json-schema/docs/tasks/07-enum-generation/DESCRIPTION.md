# Task 07 — Enum Generation from relevantCodeList

Build logic that resolves a concept's `relevantCodeList` references to actual enum values for the
generated JSON Schema. When a field has `relevantCodeList`, it means the user should select from a
fixed list of options defined in another conceptscheme. The transformation extracts these options
as an `enum` constraint.

## Scope

### Class: `EnumGenerator` (`src/services/enum-generator.ts`)

```typescript
export interface EnumResolution {
  /** Whether the code list reference was successfully resolved. */
  resolved: boolean
  /** Array of enum values (concept IDs as strings). Empty if unresolved or no concepts found. */
  values: string[]
  /** Optional display labels keyed by value, for description enrichment. */
  labels?: Map<string, string>
  /** Warning message if resolution partially failed. */
  warning?: string
}

export class EnumGenerator {
  /**
   * Resolve all relevantCodeList refs on a concept to enum values.
   * @param result - Parsed codelist result
   * @param concept - Concept with relevantCodeList property set
   * @returns Resolution result with enum values and metadata
   */
  resolveEnums(result: CodelistResult, concept: Concept): EnumResolution

  /**
   * Resolve a single scheme ref to its top-level concept IDs.
   * @param result - Parsed codelist result
   * @param schemeRef - URI of the target conceptscheme
   * @returns Array of concept ID strings, or empty array if unresolvable
   */
  resolveSchemeToConcepts(result: CodelistResult, schemeRef: string): string[]
}
```

### Resolution Logic

1. **Iterate over `relevantCodeList` refs**: Each ref is a URI pointing to another `skos:ConceptScheme`.

2. **Look up in local index**: Check if the ref exists as a key in `result.schemes`. If found,
   retrieve its top concepts via `result.topConcepts.get(schemeId)`.

3. **Extract enum values**: For each top concept in the referenced scheme:
   - Use the concept's full ID (e.g., `riepr-emissiepunt-type:schoorsteen`) as the enum value
   - Store the `prefLabel` alongside for potential description enrichment

4. **Handle multiple code lists**: A concept can have multiple `relevantCodeList` refs. Merge all
   resolved concept IDs into a single flat enum array.

5. **Graceful degradation for unresolvable refs**:
   - External domain refs (`https://vito.be/...`): silently skip, add warning
   - Placeholder refs (`http://TODO`): silently skip, add warning
   - Missing prefix refs (`conceptscheme-alg:...`): silently skip, add warning
   - Local but missing schemes: silently skip, add warning

6. **Empty result handling**: If ALL refs fail resolution, return `{resolved: false, values: [],
   warning: "All relevantCodeList refs unresolved"}`. The consuming logic should handle this by
   generating `"type": "string"` without an enum constraint and logging a warning.

### Known Unresolvable Refs (from ISSUES.md)

The following fields will produce empty enums with warnings. This is expected behavior — do NOT
treat these as bugs:

| Field | Bad Reference | Scheme |
|---|---|---|
| Materiaalcode | `http://TODO` | operationeel_grondstoffen |
| Meetfrequentie | `http://TODO` | operationeel_water_lozing |
| Stof | `conceptscheme-alg:chemische_stof` | installatie_eigenschappen |
| Techniek | `https://vito.be/codelijst/techniek` | installatie_eigenschappen |
| Verontreinigende stof | `conceptscheme-alg:csor/variabele` | operationeel_water_lozing |

### Schema Integration

When the mapper (Task 06) encounters a concept with `relevantCodeList`, it delegates to this
service. The resulting enum values are stored in `SchemaField.enumValues`. If resolution fails,
the field falls back to `"type": "string"` with no enum and a warning logged.

### Unit Tests (`src/services/enum-generator.test.ts`)

```typescript
describe('EnumGenerator', () => {
  it('resolves local scheme ref to concept ID enum values', () => { ... })
  it('handles multiple relevantCodeList refs by merging results', () => { ... })
  it('returns empty array for external domain refs with warning', () => { ... })
  it('returns empty array for http://TODO placeholder refs with warning', () => { ... })
  it('returns empty array for missing prefix refs with warning', () => { ... })
  it('preserves prefLabel alongside each enum value', () => { ... })
  it('marks resolved=false when ALL refs fail', () => { ... })

  // Real data tests
  it('resolves emissiepunt_type scheme to [schoorsteen, lozingspunt, fakkel, gebouw]', () => { ... })
  it('produces empty enum for Materiaalcode (http://TODO)', () => { ... })
})
```

## Deliverables

1. `src/services/enum-generator.ts` — Full enum resolution implementation
2. `src/services/enum-generator.test.ts` — Unit tests covering all resolution paths
3. Integration with ConceptMapper: mapper calls enum generator for concepts with relevantCodeList

## Definition of Done

- All unit tests pass against the real codelist data
- Local scheme refs resolve correctly to concept ID arrays
- External/unresolved refs produce empty results with descriptive warnings
- Warning messages are logged (console.warn) but do not throw exceptions
- Multiple code list refs on one concept merge into a single flat enum
- Enum values use full concept IDs (not just local parts) to maintain uniqueness across schemes
- Empty enums from failed resolution cause the field to fall back to `"type": "string"` without enum constraint
