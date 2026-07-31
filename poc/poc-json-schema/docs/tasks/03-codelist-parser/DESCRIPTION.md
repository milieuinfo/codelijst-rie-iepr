# Task 03 — Codelist Parser Service

Build a service class that reads the RIE-IEPR JSON-LD codelist file and produces a structured
`CodelistResult` with indexed nodes, typed schemes, typed concepts, and resolved top concept lists.

This is the foundation upon which all subsequent transformation logic depends. The parser must be
**content-agnostic** — it should not special-case any scheme name or property value. New themes
added upstream should require zero code changes here.

## Scope

### Class: `CodelistParser` (`src/services/codelist-parser.ts`)

The parser follows the same strategy as `CodelistService` from poc-flow-operationeel but is built
as a standalone module. Study the existing implementation for reference patterns but do not copy
code verbatim.

#### Core Methods

```typescript
export class CodelistParser {
  /**
   * Load and parse the full codelist from a local file path.
   * @param filePath - Absolute or relative path to rie-iepr.jsonld
   */
  loadFromFile(filePath: string): CodelistResult

  /**
   * Parse raw JSON data into a structured result.
   * Used internally by loadFromFile; exposed for testing.
   */
  parseData(data: Record<string, unknown>): CodelistResult
}
```

#### Parsing Strategy

1. **Node Indexing**: Recursively walk every object/array in the top-level `graph`. Every node
   with an `@id` (or compacted alias `id`) gets indexed. If the same ID appears multiple times
   (common — nodes are both flattened at graph root and re-embedded inline), later sightings
   **merge in missing properties** rather than replacing. This handles the source data's mix of
   standard JSON-LD keywords (`@id`, `@type`) and compacted aliases (`id`, `_type`, `has_pref_label`).

2. **Type Classification**: Classify each indexed node as a Scheme (if `_type` includes
   `skos:ConceptScheme`), a Concept (if `_type` includes `skos:Concept`), or both (a node can be
   both). Build separate typed views from the canonical index.

3. **Top Concept Resolution**: For each scheme, resolve its `hasTopConcept` / `has_top_concept`
   references to Concept objects. Handle both string refs and inline `{@id}` node refs.

4. **Property Mapping**: Convert raw JSON-LD node values into the typed `Concept` and `Scheme`
   interfaces defined in Task 02. Key mappings:
   - Boolean fields (`isVerplicht`, `isMeervoudig`, etc.): parse "true"/"false" strings to boolean
   - Array fields (`relevantCodeList`, `seeAlso`, etc.): normalize arrays and comma-separated strings
   - Single-value fields (`relevantDataType`, `relevantClass`): extract first value if array
   - Condition values: normalize URI-style condition values by extracting local name fragment
     (e.g., `"concept:true"` → `"true"`)

#### Helper Methods (private)

- `buildNodeIndex(root: unknown): Map<string, JsonLdNode>` — recursive walker with merge logic
- `idOf(value: unknown): string | undefined` — resolve ID from string, `@id`, or `id` key
- `getTypes(node: JsonLdNode): string[]` — extract type array from `@type` or `_type`
- `toScheme(node: JsonLdNode): Scheme` — map raw node to typed Scheme
- `toConcept(node: JsonLdNode, normalizeBooleans: boolean): Concept` — map raw node to typed Concept
- `idsOf(value: unknown): string[] | undefined` — normalize ref arrays handling inline nodes and comma-separated strings
- `parseBoolean(value: unknown): boolean | undefined` — handle "true", "false", 1, 0, true, false
- `normalizeConditionValue(conditionValue: string): string` — strip URI prefixes for comparison
- `getValue(obj, keys): unknown` — try multiple key aliases (standard + compacted)

### Unit Tests (`src/services/codelist-parser.test.ts`)

Test against the actual codelist file. Key test cases:

```typescript
describe('CodelistParser', () => {
  let result: CodelistResult

  beforeEach(async () => {
    result = parser.loadFromFile('../../public/resources/.../rie-iepr.jsonld')
  })

  it('indexes all nodes without duplicates', () => { ... })
  it('classifies schemes correctly', () => { ... })
  it('classifies concepts correctly', () => { ... })
  it('resolves hasTopConcept refs to Concept objects', () => { ... })
  it('handles inline node refs in relevantCodeList', () => { ... })
  it('normalizes boolean fields from string values', () => { ... })
  it('parses conditionPath and conditionValue correctly', () => { ... })
  it('normalizes conditionValue from "concept:true" to "true"', () => { ... })
  it('handles comma-separated ref strings ("type:a,type:b")', () => { ... })
  it('finds thema_type scheme with 6 theme concepts', () => { ... })
  it('finds operationeel_lucht scheme', () => { ... })
  it('gracefully handles missing/unresolvable refs (returns empty array)', () => { ... })
})
```

## Deliverables

1. `src/services/codelist-parser.ts` — Full parser implementation
2. `src/services/codelist-parser.test.ts` — Unit tests covering parsing edge cases
3. Parser handles all known codelist quirks: compacted aliases, inline nodes, merged duplicates, comma-separated refs

## Definition of Done

- All unit tests pass (`npm run test`)
- `result.schemes.size > 0` and `result.concepts.size > 0` when parsing the real codelist
- `thema_type` scheme has exactly 6 top concepts (Grondstoffen, Grondwater, Lucht, Water, Zelfcontrole lucht, Zelfcontrole water)
- Boolean fields are correctly normalized from string values
- Condition values are normalized for comparison
- Unresolvable external refs return empty arrays without throwing
- No imports from poc-flow-operationeel or any other POC directory
