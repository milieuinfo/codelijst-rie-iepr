# Known Issues and Limitations

This file tracks data-quality gaps in the source codelist and environment
constraints discovered while building the POC, per PROJECT_OUTLINE.md's
instruction to report rather than silently work around them.

## Data-quality gaps in rie-iepr.jsonld

- **Issue ID**: THEMA-SCHEME-NO-PREFLABEL
  - **Description**: `conceptscheme:thema_type` has no `prefLabel`, even though PROJECT_OUTLINE.md says "the label of this box is the conceptscheme preflabel". Most other conceptschemes (e.g. `operationeel_lucht`) do have one.
  - **Impact**: Cosmetic only.
  - **Status**: Open (upstream data).
  - **Solution**: `codelijst-theme-selector.ts` falls back to the fixed Dutch label "Thema" when `prefLabel` is absent.

- **Issue ID**: CODELIST-UNRESOLVABLE-REFS
  - **Description**: Several fields' `relevantCodeList` point outside this document: an external domain (`https://vito.be/codelijst/techniek`), a different/non-existent prefix (`conceptscheme-alg:chemische_stof`, `conceptscheme-alg:csor/variabele`), or the literal placeholder `http://TODO` (e.g. `riepr-operationeel-water:lozing-meetfrequentie`).
  - **Impact**: Those fields would have no options to choose from.
  - **Status**: Open (upstream data).
  - **Solution**: `CodelistService.getCodeListSchemes()` resolves refs against the in-document scheme index and simply returns `[]` for anything it can't find; `codelijst-operationeel-fields.ts` still renders the `<vl-select>` (with only its placeholder option) rather than erroring out, per the "silently ignore, still show a selection" rule in PROJECT_OUTLINE.md.

- **Issue ID**: HASTOPCONCEPT-INCLUDES-CHILDREN
  - **Description**: `hasTopConcept` on an operationeel-* scheme lists every concept in the scheme, including composite children (a field's own `narrower` concepts), not just the top-level questions. E.g. `conceptscheme:operationeel_lucht`'s `hasTopConcept` contains both `riepr-operationeel-lucht:afvalproduct` (a composite root) and its children `..._aard`/`..._hoeveelheid`/`..._naam` as siblings.
  - **Impact**: Naively rendering every `hasTopConcept` entry as a top-level field would duplicate composite children as standalone fields.
  - **Status**: Resolved in code.
  - **Solution**: `codelijst-operationeel-fields.ts` derives root fields as `getTopConceptsForScheme(...).filter(field => !field.broader)` — a concept with `broader` set is a composite child, never a root question. See AGENTS.md for details.

- **Issue ID**: RELEVANTRIEPR-PLURALIZATION-TYPO
  - **Description**: The concept `riepr-thema-type:grondwater-kwaliteitsmeting` (sub-thema "Kwaliteitsmeting" under "Grondwater") has `"relevantRiepr": ["conceptscheme:operationeel_grondwater_kwaliteitsmetings"]` with a trailing "s" (plural), but the actual conceptscheme defined in the same source file is named `conceptscheme:operationeel_grondwater_kwaliteitsmeting` (singular, no trailing "s"). Verified via `grep -o 'conceptscheme:operationeel_grondwater_kwaliteitsmeting[a-z]*' public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld | sort -u`, which shows both the singular (the actual scheme id, appearing with `"_type":["skos:ConceptScheme"]`) and the plural-with-trailing-s reference (only ever appears as a dangling `relevantRiepr` value, never as an actual node id).
  - **Impact**: Selecting Grondwater → Kwaliteitsmeting in the app shows "Voor dit thema zijn geen operationele gegevens gedefinieerd." even though a matching scheme with real fields (Aard, Datum monstername, Resultaat, etc.) exists under the singular name. The unresolvable ref is silently swallowed by `CodelistService.getRelevantRieprRefs()` returning `[]`.
  - **Status**: Open (upstream data).
  - **Solution**: The app already degrades gracefully — it shows the "no operational data defined" message rather than crashing, consistent with the existing `CODELIST-UNRESOLVABLE-REFS` handling pattern. Fix requires a correction to the source `rie-iepr.jsonld` data (either fix the `relevantRiepr` reference or rename the scheme id, whichever is intended). No code changes needed per PROJECT_OUTLINE.md's guardrail against modifying codelist data.

## Environment / dependency notes

- **Issue ID**: FLUX-COMPONENTS-PRIVATE-REGISTRY
  - **Description**: The real Vlaanderen `flux-web-components` package is published as `@domg-wc/components` (+ `@domg-wc/styles`, `@domg-wc/common`) to a private Artifactory registry (`https://repo.omgeving.vlaanderen.be/artifactory/api/npm/local-npm/`), not to public npm. An earlier version of this POC could not find it under any public-npm name and fell back to hand-rolled CSS mimicking `--vl-*` variable names, which violated the "use vl-* components, avoid custom CSS" guardrail.
  - **Impact**: None now — the registry allows anonymous reads, so `npm install` works without credentials.
  - **Status**: Resolved.
  - **Solution**: `.npmrc` routes the `@domg-wc`/`@domg` scopes to that registry; every other dependency still resolves from public npm. See AGENTS.md section 3.

## Issue Tracking Template
- **Issue ID**: Unique identifier
- **Description**: Problem description
- **Impact**: Severity and affected functionality
- **Status**: Open/In Progress/Resolved
- **Solution**: Proposed or implemented solution
