# Task 12 — Multi-Step seeAlso Chain Composition

Build logic that merges fields from multiple schemes connected via `seeAlso` chains into a single
coherent set of schema properties per theme. Themes like Lucht chain through three schemes
(`operationeel_lucht` → `operationeel_lucht_bron` → `operationeel_lucht_rapportering`), each
contributing different field groups to the final domain schema.

## Scope

### Class: `ChainComposer` (`src/services/chain-composer.ts`)

```typescript
export interface ThemeFieldSet {
  /** All SchemaFields collected across all schemes in the theme's chain. */
  fields: SchemaField[]
  /** Map of scheme ID → its contribution (fields) for debugging/inspection. */
  contributions: Map<string, SchemaField[]>
}

export class ChainComposer {
  /**
   * Collect and merge all fields from every scheme in a theme's seeAlso chain.
   * @param result - Parsed codelist result
   * @param chain - The resolved theme chain from ThemeResolver
   * @param mapper - ConceptMapper instance for mapping concepts to fields
   * @returns Merged field set with all contributions tracked
   */
  composeThemeFields(
    result: CodelistResult,
    chain: ThemeChain,
    mapper: ConceptMapper,
  ): ThemeFieldSet

  /**
   * Get root-level fields from a single operationeel scheme.
   * Applies the !broader filter to exclude composite children from top level.
   * @param result - Parsed codelist
   * @param schemeId - Scheme whose fields to extract
   * @param mapper - ConceptMapper for concept-to-field conversion
   * @returns Array of root SchemaFields
   */
  getSchemeRootFields(
    result: CodelistResult,
    schemeId: string,
    mapper: ConceptMapper,
  ): SchemaField[]
}
```

### Composition Logic

1. **Iterate chain schemes**: For each scheme ID in `chain.schemeIds`, call `getSchemeRootFields()`
   to extract its top-level (non-child) concepts mapped as SchemaFields.

2. **Filter root fields**: Apply `!field.broader` rule — only concepts without a broader reference
   become root fields. This prevents duplicate rendering of composite children that are already
   nested under their parent.

3. **Group by observation level**: In a seeAlso chain, each level produces its own Observation.
   The innermost (leaf) scheme generates the primary measurement Observation. Higher levels in
   the chain generate contextual Observations (structural selection, installation context).
   Fields are grouped per scheme level rather than merged flat:
   ```
   operationeel_lucht (level 1):          → Structural observation: emissiepunt selected
     operationeel_lucht_bron (level 2):    → Structural observation: bron(nen) selected
       operationeel_lucht_rapportering     → Primary observation: brandstof/afvalproduct/stof data
         (level 3, leaf):
   ```

4. **Build hierarchical output**: The leaf-level scheme's fields form the primary domain schema.
   Parent levels contribute context schemas that the primary schema references via `$ref` or
   `allOf`. Each level is self-contained.

5. **Deduplicate property names within each level**: If two concepts at the same level produce
   the same derived property name, append a numeric suffix. Cross-level deduplication is not
   needed since each level has its own schema fragment.

### Chain Structure Reference (Observation-per-Level)

Each chain level produces its own Observation. The innermost scheme generates the primary
measurement observation; higher levels produce contextual structural observations.

| Theme | Level 1 (context obs.) | Level 2 (structural obs.) | Level 3+ (primary measurement obs.) |
|---|---|---|---|
| Grondstoffen | `operationeel_grondstoffen` (= leaf = primary) | — | — |
| Grondwater | `operationeel_grondwater` (= leaf = primary) | — | — |
| Lucht | `operationeel_lucht` (emissiepunt) | `operationeel_lucht_bron` (bronnen) | `operationeel_lucht_rapportering` |
| Water | `operationeel_water` (controleinrichting) | — | `operationeel_water_lozing` |
| Zelfcontrole lucht | `operationeel_zelfcontrole_lucht` | — | `operationeel_zelfcontrole_lucht_meting` |
| Zelfcontrole water | `operationeel_zelfcontrole_water` | — | `operationeel_zelfcontrole_water_meting` |

### Observation-per-Level Output Structure

The transformation produces separate schema fragments per chain depth:

1. **Leaf-level schema** (primary observation): Contains the full measurement fields from the
   innermost scheme (e.g., brandstof/afvalproduct/stof composites from
   `operationeel_lucht_rapportering`). This is the main domain schema file.

2. **Context-level schemas** (structural observations): Contain fields from higher chain levels
   that capture contextual selections (which emissiepunt, which bronnen). These are referenced
   by the primary schema via `$ref` or embedded as context properties.

3. **Theme wrapper**: A top-level schema that ties together all observation levels using `allOf`
   to compose them into the complete theme validation.

### Unit Tests (`src/services/chain-composer.test.ts`)

```typescript
describe('ChainComposer', () => {
  it('merges fields from single-scheme chains correctly', () => { ... })
  it('merges fields from multi-scheme Lucht chain (3 schemes)', () => { ... })
  it('filters out child concepts via !broader rule', () => { ... })
  it('tracks per-scheme contributions in map', () => { ... })
  it('handles property name collisions with scheme suffix', () => { ... })
  it('skips isOnzichtbaar concepts during collection', () => { ... })

  // Real data tests
  it('Lucht theme produces fields from all 3 chained schemes', () => { ... })
  it('Grondstoffen theme produces ~7 root fields from single scheme', () => { ... })
})
```

## Deliverables

1. `src/services/chain-composer.ts` — Full chain composition implementation
2. `src/services/chain-composer.test.ts` — Unit tests covering merge and dedup logic

## Definition of Done

- All unit tests pass against the real codelist data
- Multi-step chains produce merged field sets containing ALL root fields from ALL schemes
- Child concepts are excluded from root level via `!broader` filter
- Property name collisions across schemes get disambiguating suffixes
- Per-scheme contribution tracking works correctly for inspection
- The Lucht theme's composed fields include entries from operationeel_lucht, bron, AND rapportering
- No duplicate properties appear in the final flat list (collisions resolved)
