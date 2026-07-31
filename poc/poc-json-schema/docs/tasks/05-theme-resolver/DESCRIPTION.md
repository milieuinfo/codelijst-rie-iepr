# Task 05 — Theme-to-Scheme Resolver

Build a service that traverses the codelist's thematic navigation model to determine which
operationeel schemes contribute fields for each theme. This resolves the `seeAlso` chain from
a thema concept through intermediate schemes to leaf reporting schemes.

## Scope

### Class: `ThemeResolver` (`src/services/theme-resolver.ts`)

```typescript
export interface ThemeChain {
  /** The thema concept (e.g., "Lucht"). */
  themeConcept: Concept
  /** Ordered list of scheme IDs in the seeAlso chain, starting with the base operationeel scheme. */
  schemeIds: string[]
  /** Map of concept → next scheme for structural chaining within the flow. */
  structuralChains: Map<string, string>  // conceptId → targetSchemeId
}

export class ThemeResolver {
  /**
   * Resolve all themes and their associated operationeel scheme chains.
   * @param result - The parsed codelist result from CodelistParser
   * @returns Map of theme name (local id part) to its resolved chain info
   */
  resolveAllThemes(result: CodelistResult): Map<string, ThemeChain>

  /**
   * Resolve a single theme by its concept ID.
   * @param result - Parsed codelist
   * @param themeConceptId - ID of the thema concept (e.g., 'riepr-thema-type:lucht')
   * @returns Resolved chain or undefined if not found
   */
  resolveTheme(result: CodelistResult, themeConceptId: string): ThemeChain | undefined

  /**
   * Get the list of all available theme concepts from thema_type scheme.
   */
  getThemeConcepts(result: CodelistResult): Concept[]
}
```

### Resolution Logic

1. **Find thema_type scheme**: Look up `conceptscheme:thema_type` in the schemes map.

2. **Get top concepts**: Retrieve all top-level concepts from thema_type — these are the six
   themes: Grondstoffen, Grondwater, Lucht, Water, Zelfcontrole lucht, Zelfcontrole water.

3. **Resolve base operationeel scheme**: For each theme concept, follow its first `seeAlso`
   reference that resolves to a local `skos:ConceptScheme`. This is the base operationeel scheme.

4. **Discover structural chains**: Within each scheme's top concepts, find any concept that has
   `seeAlso` pointing to another local scheme. These represent multi-step flows where selecting
   a structural element transitions to a sub-scheme. Record these as `{conceptId → targetSchemeId}`.

5. **Follow chain recursively**: From each discovered sub-scheme, repeat step 4 until no more
   `seeAlso` refs lead to new schemes. The full ordered list forms the `schemeIds` array.

### Expected Chains (from codelist analysis)

| Theme | Chain |
|---|---|
| Grondstoffen | `[operationeel_grondstoffen]` |
| Grondwater | `[operationeel_grondwater]` |
| Lucht | `[operationeel_lucht, operationeel_lucht_bron, operationeel_lucht_rapportering]` |
| Water | `[operationeel_water, operationeel_water_lozing]` |
| Zelfcontrole lucht | `[operationeel_zelfcontrole_lucht, operationeel_zelfcontrole_lucht_meting]` |
| Zelfcontrole water | `[operationeel_zelfcontrole_water, operationeel_zelfcontrole_water_meting]` |

Note: The intermediate schemes in the chain (e.g., `operationeel_lucht_bron`) contribute their own
fields AND serve as navigation waypoints. All fields from ALL schemes in a theme's chain are
merged into the final domain schema for that theme.

### Unit Tests (`src/services/theme-resolver.test.ts`)

```typescript
describe('ThemeResolver', () => {
  it('finds exactly 6 themes in thema_type scheme', () => { ... })
  it('resolves Lucht chain through 3 schemes (lucht → bron → rapportering)', () => { ... })
  it('resolves Grondstoffen chain with single scheme', () => { ... })
  it('resolves Water chain through 2 schemes (water → lozing)', () => { ... })
  it('detects structural chains via concept-level seeAlso refs', () => { ... })
  it('returns undefined for non-existent theme IDs', () => { ... })
})
```

## Deliverables

1. `src/services/theme-resolver.ts` — Full resolver implementation
2. `src/services/theme-resolver.test.ts` — Unit tests verifying all 6 theme chains resolve correctly

## Definition of Done

- All unit tests pass against the real codelist data
- All 6 themes resolve to correct scheme chains matching the expected table above
- Structural chains (concept→scheme transitions) are detected and recorded
- External/unresolvable `seeAlso` refs are silently dropped (no exceptions)
- Theme names use Dutch labels from `prefLabel` where available, falling back to local ID part
