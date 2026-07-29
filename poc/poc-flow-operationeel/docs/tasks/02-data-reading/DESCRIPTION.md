# Epic 02: JSON-LD Codelist Data Reading

## AS IS

- The codelist data lives in `src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld` (7615 lines)
- This is a Java/Maven resource file embedded in the backend
- No TypeScript code exists to parse or consume this JSON-LD structure
- The JSON-LD uses SKOS concepts with extended RIE-IEPR vocabulary (`riepr-vocab`)
- Complex nested structures: concept schemes contain concepts which reference other concept schemes inline

## TO BE

### Goals

Create generic TypeScript services that can read, parse, and traverse the JSON-LD codelist structure without hardcoding any specific conceptscheme IDs. The service must support:
- Loading the JSON-LD file as static asset
- Resolving all @context mappings for property names
- Traversing SKOS hierarchy via narrower/broader relations
- Extracting relevantDataType, relevantCodeList, relevantRiepr, isVerplicht, isMeervoudig
- Handling both string IDs and inline expanded objects (common in this dataset)

### In Scope

- Create `CodelistService` class that reads `rie-iepr.jsonld`:
  - Parse `@context` to build a flat property name → RDF mapping
  - Flatten the `graph[]` array into an indexable map by `id`
  - Resolve shorthand references like `"conceptscheme:operationeel_lucht"` to full objects (including inline expansions)
- Create model types in `src/models/`:
  - `ConceptScheme` — SKOS ConceptScheme with prefLabel, hasTopConcepts[], narrowers Map
  - `Concept` — SKOS Concept with code, prefLabel, definition, broader, narrower, relevantDataType, relevantCodeList[], relevantRiepr[], isVerplicht, isMeervoudig
  - `Unit` — QUDT unit reference with code and prefLabel
- Implement helper methods:
  - `getConceptSchemes(): Map<string, ConceptScheme>` — all top-level conceptschemes
  - `getTopConcepts(schemeId: string): Concept[]` — direct children of a conceptscheme
  - `getAllNarrowerRecursive(concept: Concept): Concept[]` — full subtree traversal
  - `resolveRelevantDataType(uri: string): DataType | null` — map URI to xsd:string, xsd:decimal, etc.
  - `getConceptById(id: string): Concept | null` — lookup including expanded inline refs
- Handle edge cases found in the data:
  - Boolean fields stored as strings (`"true"` / `"false"`) for isVerplicht/isMeervoudig
  - Some concepts have `relevantDataType` pointing to non-standard URIs (e.g., `http://www.w3.org/ns/adms#`)
  - Mixed array formats: some `narrower` values are arrays of strings, others are arrays of objects
  - Inline concept scheme expansions embedded within relevantRiepr arrays

### Out of Scope

- Caching or lazy loading optimizations
- Fetching JSON-LD from remote URLs (all local)
- Validation against JSON-LD schemas
- Converting to other RDF serializations (Turtle, N-Triples)

## DOD (Definition of Done)

- [ ] `CodelistService` loads `rie-iepr.jsonld` and parses without errors
- [ ] All 24 concept schemes are discoverable via `getConceptSchemes()`
- [ ] SKOS hierarchy traversal works correctly for nested narrower/broader relations
- [ ] String booleans ("true"/"false") are properly converted to boolean type
- [ ] Inline expanded objects in relevantRiepr arrays are resolved correctly
- [ ] Non-standard relevantDataType URIs fall back gracefully with null return
- [ ] Unit tests verify parsing of at least 5 different patterns found in the codelist
- [ ] JSDoc on all public methods explaining parameters and return types
