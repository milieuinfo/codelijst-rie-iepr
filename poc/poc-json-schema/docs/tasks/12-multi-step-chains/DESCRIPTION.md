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

3. **Merge across schemes**: Concatenate all root field arrays from all schemes into a single flat
   list. Each scheme contributes independently; there is no nesting between schemes at this stage.

4. **Deduplicate property names**: If two schemes produce fields with the same derived property
   name, append a scheme-derived suffix to disambiguate (e.g., `emissiepunt_lucht` vs
   `emissiepunt_water`). Track collisions and log warnings.

5. **Track contributions**: Maintain a per-scheme map so downstream logic can inspect which fields
   came from which scheme. Useful for debugging and future schema splitting.

### Chain Structure Reference

| Theme | Schemes in Chain | Expected Root Field Count |
|---|---|---|
| Grondstoffen | 1 scheme | ~7 fields (including grondstof composite + children counted separately) |
| Grondwater | 1 scheme | ~14+ fields (peilmeting, kwaliteitsmeting, onttrekking composites) |
| Lucht | 3 schemes | Emissiepunt + Bronnen from base/bron, plus rapportering composites |
| Water | 2 schemes | Controleinrichting from base, lozing details from sub |
| Zelfcontrole lucht | 2 schemes | Base fields + meting sub-fields (datum, labo, parameter) |
| Zelfcontrole water | 2 schemes | Base fields + meting sub-fields (datum, labo, parameter) |

### Property Name Scoping

Fields from intermediate schemes may share names with fields from the base scheme. Since all
fields merge into one flat `properties` object at the theme level, name collisions must be handled:

- **Strategy**: If two concepts from different schemes produce the same derived property name, use
  `<name>_<schemeShortName>` format for disambiguation. Example: if both `operationeel_lucht` and
  `operationeel_lucht_rapportering` have a concept named "Naam", they become `naam_lucht` and
  `naam_rapportering`.

- **No collision within same parent's children**: Children of different composite parents can share
  names because they're namespaced under their parent key. Deduplication only applies to root-level
  properties across schemes.

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
