# Known Issues and Limitations

This file tracks data-quality gaps in the source codelist and environment
constraints discovered while building the POC, per PROJECT_OUTLINE.md's
instruction to report rather than silently work around them.

## Data-quality gaps in rie-iepr.jsonld

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

**Note**: two previously-tracked data-quality issues — a missing `prefLabel` on `conceptscheme:thema_type`, and a pluralization typo in `riepr-thema-type:grondwater-kwaliteitsmeting`'s `relevantRiepr` — were confirmed fixed upstream after the 2026-07-27 codelist refresh and removed from this list.

## Frontend rendering fixes (2026-07-27)

- **Issue ID**: TEMPORAL-DATA-TYPE-RANGE
  - **Description**: Fields with `relevantDataType=dcterms:temporal` (e.g. `riepr-operationeel-grondwater:periode`, "Periode van onttrekking") rendered as plain `<vl-input-field type="text">` instead of a date range picker.
  - **Impact**: Users could not select a start/end date range; had to type text manually without validation.
  - **Status**: Resolved.
  - **Solution**: Added `case 'dcterms:temporal':` in `renderFieldControl()` → renders `<vl-datepicker type="range" ...>`. Mirrors the existing `xsd:date`/`xsd:dateTime` pattern.

- **Issue ID**: DURATION-DATA-TYPE-PATTERN
  - **Description**: Fields with `relevantDataType=xsd:duration` (e.g. `riepr-operationeel-grondwater:duur-stil`, "Duur pompen stil") rendered as plain text input without format guidance for `dd:hh:mm:ss` duration values.
  - **Impact**: No visual hint or validation for the expected format.
  - **Status**: Resolved.
  - **Solution**: Added `case 'xsd:duration':` → renders `<vl-input-field type="text" pattern="[0-9]+:[0-2][0-9]:[0-5][0-9]:[0-5][0-9]" placeholder="dd:hh:mm:ss">`. No dedicated duration component exists in `@domg-wc/components/form/`; a text field with an HTML5 pattern is the best available approach.

- **Issue ID**: RELEVANTUNIT-VISUALIZATION
  - **Description**: `relevantUnit` was appended inline into the field label string (e.g. "Debiet (m3)") instead of rendered as a separate element next to the input. Additionally, when `relevantUnit` resolves to a conceptscheme (multiple possible units) rather than a single unit concept, no dropdown existed.
  - **Impact**: Unit display inconsistent with design system conventions; multiple-unit case completely unhandled.
  - **Status**: Partially resolved — single-unit case verified against live data; scheme-dropdown branch unverified.
  - **Solution**: Single unit concept: `renderWithUnit()` wraps the form-label + control in a `.vl-input-group` container with a `.vl-input-addon` span displaying the unit's `code` or `prefLabel` next to the input. Multiple units (unit resolves to a Scheme): renders a `<vl-select>` populated from `getTopConceptsForScheme()`, following the same options-building pattern as `relevantCodeList`. The scheme-dropdown branch is implemented generically per the content-agnostic philosophy but cannot be exercised against live data (all distinct `relevantUnit` target IDs in the current codelist resolve to `qudt:Unit` concepts or are unresolvable external refs).

- **Issue ID**: CONDITIONAL-VISIBILITY (conditionPath / conditionValue)
   - **Description**: The RIE-IEPR codelist source defines `conditionPath` (SHACL `sh:path` alias) and `conditionValue` (SHACL `sh:hasValue` alias) on concepts to indicate that a field should only be shown when another referenced field's current value matches the condition. These term aliases exist in `src/source/prefix.json` (the parent codegen project) but no concept in the live codelist data uses them yet. A user reported "conditional path logic no longer works" — leading hypothesis was that the SELECT-VALUE-REVERT fix (explicit `.value="${fieldValue}"` + `selected:` flags on every `<vl-select>`) created a controlled-component race where re-asserting `.value` on re-render could suppress or overwrite `_fieldValues`, breaking condition-matching for selects used as trigger fields.
   - **Impact**: Conditional visibility rules are silently ignored (all fields render regardless) until real data starts using this property.
   - **Status**: Implemented, verified working via e2e Playwright test (2026-07-27). No bug found.
   - **Solution**: `Concept` interface extended with `conditionPath?: string` and `conditionValue?: string`. `CodelistService`'s node-to-Concept mapping parses both standard keys and snake_case variants, resolving inline `{@id}` refs via `idOf()`. `codelijst-operationeel-fields.ts` tracks live form-control values via an internal `_fieldValues` Map updated from `@vl-input`/`@vl-change` listeners on every rendered vl-* control; before rendering a field, `matchesCondition()` resolves the referenced field's stored value and compares it to `conditionValue` (string equality; defaults to hidden until the trigger field has a matching value). E2E verification achieved by injecting synthetic `condition_path`/`condition_value` onto two real concepts in the water scheme via `page.route()` interception — confirmed that selecting a matching trigger value correctly reveals the conditioned field, and switching to a non-matching value hides it again. Verified no race between `.value="${fieldValue}"` controlled-binding and `_fieldValues` tracking: when the triggering select fires `@vl-input`, `_onControlInput` stores the value, then `requestUpdate()` triggers re-render where fresh `.options` arrays cause child `updated()` calls that restore `this.value` via `getSelectedOption()` with explicit `selected:` flags — this is safe because Lit batches all pending property changes into one `updated()` cycle, so both the new options AND the user-set value are present simultaneously, yielding consistent results. The user's report was traced to testing against real codelist data which contains zero concepts using these properties (confirmed via grep/md5), making end-to-end verification impossible without synthetic data injection. Added permanent Playwright regression test in `tests/codelijst.spec.ts`.

- **Issue ID**: SELECT-VALUE-REVERT (relevantCodeList / unit-scheme selects)
  - **Description**: `<vl-select>` controls rendered for fields with `relevantCodeList` (e.g. "Bepalingsmethode", "Peilmethode", "Pomptoestand") visually reverted to their placeholder after any unrelated field interaction elsewhere in the same form, even though the underlying tracked value (used for `conditionPath` evaluation) was captured correctly. Root cause: every control's input/change handler calls `requestUpdate()`, triggering a full re-render of the whole field tree; each re-render builds a fresh `.options` array (new reference) for every select. In `@domg-wc/components/form/select/vl-select.component.js`, the component's `updated()` lifecycle treats any `.options` reference change as "options changed," calls `getSelectedOption()` (which looks for an option flagged `selected: true`), finds none, and resets `this.value = ''`.
  - **Impact**: Users could not reliably see or confirm their selection in any `<vl-select>` driven by `relevantCodeList` or a `relevantUnit` conceptscheme, including composite children inside repeatable groups.
  - **Status**: Resolved.
  - **Solution**: Applied the same controlled-component pattern already used in `codelijst-theme-selector.ts` to every `<vl-select>` in `codelijst-operationeel-fields.ts`: derive `fieldValue = String(this._fieldValues.get(id) ?? '')` per control, set a `selected: concept.id === fieldValue` flag on each option, and bind `.value="${fieldValue}"` explicitly on the `<vl-select>`. Added a Playwright regression test that selects a value, triggers an unrelated full re-render, and asserts the selection is still displayed.

## Build / tooling gaps (resolved)

- **Issue ID**: MANUAL-CODELIST-COPY
  - **Description**: The POC consumed `rie-iepr.jsonld` from a manually copied copy under `public/resources/...`. If the upstream source (`../src/main/resources/.../rie-iepr.jsonld`) was updated, the POC would silently serve stale codelist data. No automation existed to keep the two copies in sync.
  - **Impact**: Risk of developing against outdated codelist definitions without realizing it.
  - **Status**: Resolved.
  - **Solution**: Added `scripts/sync-codelist.mjs` which runs automatically via `predev` and `prebuild` npm lifecycle scripts. Every `npm run dev` or `npm run build` now syncs the canonical file into place before starting. See AGENTS.md section 6 and ARCHITECTURE.md "Codelist Sync" for details.

## Environment / dependency notes

- **Issue ID**: FLUX-COMPONENTS-PRIVATE-REGISTRY
  - **Description**: The real Vlaanderen `flux-web-components` package is published as `@domg-wc/components` (+ `@domg-wc/styles`, `@domg-wc/common`) to a private Artifactory registry (`https://repo.omgeving.vlaanderen.be/artifactory/api/npm/local-npm/`), not to public npm. An earlier version of this POC could not find it under any public-npm name and fell back to hand-rolled CSS mimicking `--vl-*` variable names, which violated the "use vl-* components, avoid custom CSS" guardrail.
  - **Impact**: None now — the registry allows anonymous reads, so `npm install` works without credentials.
  - **Status**: Resolved.
  - **Solution**: `.npmrc` routes the `@domg-wc`/`@domg` scopes to that registry; every other dependency still resolves from public npm. See AGENTS.md section 3.

- **Issue ID**: ESLINT-SLOW-WSL-MOUNT
  - **Description**: `npm run lint` (and standalone `npx eslint`, even on a single untouched file) hangs or takes 60-90s+ in this WSL2 environment, where the project lives on a Windows-mounted `D:` drive. `npm run build` (which includes `tsc`) and `npx tsc --noEmit` are both fast and reliable.
  - **Impact**: Lint cannot reliably gate work in this environment; false sense of "still running" rather than a real hang.
  - **Status**: Open (environment, not code).
  - **Solution**: Treat `npx tsc --noEmit` + `npm run build` as the practical correctness gate in this environment; run `npm run lint` opportunistically/in CI where filesystem I/O is native, not as a blocking local step.

## Feedback Issues (2026-07-29)

These issues were discovered during additional hands-on testing after the initial UI review (Epic 10) was completed.

- **Issue ID**: FEEDBACK-CHECKBOX-LABEL
  - **Description**: Fields with `relevantDataType=xsd:boolean` render as `<vl-checkbox>` controls but the prefLabel text does not appear visibly next to the checkbox in the UI. The `label` attribute is set on the component, but vl-checkbox may handle label display differently than other form controls.
  - **Affected fields**: "Heeft u grondstoffen geproduceerd?" (`riepr-operationeel-grondstoffen:geproduceerd`) and any other xsd:boolean fields.
  - **Impact:** Users cannot see what question the checkbox answers — critical usability issue.
  - **Status:** Open → Task 11 created.
  - **Solution:** Research vl-checkbox API declarations; fix rendering to show visible label alongside checkbox control.

- **Issue ID**: FEEDBACK-UNIT-REMOTE-RESOLUTION
  - **Description**: `relevantUnit` references that resolve to unit IDs not present in the local JSON-LD document (e.g., `unit:M3`, `http://TODO`) render without any unit indicator. Only units defined inline in the codelist data are shown.
  - **Impact:** Users entering numeric values don't know what unit is expected when the unit isn't locally resolvable.
  - **Status:** Open → Task 12 created.
  - **Solution:** Implement configurable local unit label whitelist with extension point for future remote resolution via rdfs:label fetching from base URI.

- **Issue ID**: FEEDBACK-STRUCTURAL-PICKER-GATING
  - **Description**: When an operationeel scheme or root field has `relevantRiepr` pointing to a structural/type concept, child fields should only be shown after the user selects from the structural picker dropdown. Currently all children render immediately regardless of selection state.
  - **Affected patterns:**
    - Scheme-level: `grondwater-kwaliteitsmeting` → filter type picker before showing measurement fields
    - Field-level: `brandstof` → procedure type (emissie/hoofdactiviteit/meting) before showing consumption details
  - **Impact:** Users see irrelevant form fields and may enter data for the wrong structure/procedure.
  - **Status:** Open → Task 13 created.
  - **Solution:** Add structural selection state tracking; gate child visibility behind non-empty structural picker selections.

- **Issue ID**: FEEDBACK-CONDITION-EVALUATION
  - **Description**: Fields with `conditionPath` / `conditionValue` are always rendered regardless of the trigger field's value. Root cause: `conditionValue` in JSON-LD is stored as a full URI (`concept:true`) while checkbox values are stored as plain booleans (`true`/`false`). String comparison fails because `"true" !== "concept:true"`.
  - **Affected fields:** Any field with conditional visibility rules — currently observed on grondstoffen scheme where "Grondstof" should only show when "Heeft u grondstoffen geproduceerd?" = true.
  - **Impact:** Conditional logic is effectively broken — all fields render unconditionally.
  - **Status:** Open → Task 14 created.
  - **Solution:** Normalize condition values by extracting local name from URIs (e.g., strip `concept:` prefix); normalize stored checkbox values to lowercase strings.

- **Issue ID**: FEEDBACK-CODELIST-DOCUMENTATION
  - **Description:** No Dutch-language documentation exists explaining how to read and interpret the RIE-IEPR code lists, which properties are declarative (in the data) vs imperative (application logic), and where to find each concept mapping in the source code.
  - **Impact:** Developers and domain experts cannot independently understand or extend the system without deep-diving through TypeScript source files.
  - **Status:** Open → Task 15 created.
  - **Solution:** Create comprehensive Dutch guide covering SKOS/RDF concepts, RIE-IEPR extension properties, application vs. codelist logic distinction, file structure reference, concrete example walkthrough, and common pitfalls.

## Application Logic / Hardcoded Messages (2026-07-31)

These are design decisions where hardcoding in TypeScript was unavoidable or intentional — they should be avoided going forward by encoding such content into the codelist data itself.

- **Issue ID**: HARDCODED-GATE-MESSAGE
  - **Description:** The "Selecteer eerst een type..." message shown when structural/procedural pickers gate child fields is currently hardcoded as a fallback string in `CodelijstOperationeelFields.getGateInstructionMessage()`. Ideally this text should come from the source data — either via a new `selecteerEerstMessage` property on Concept, or derived from an existing codelist field's definition/label that serves as instructional text on the same row as the relevantRiepr declaration.
  - **Current implementation:** Three-tier fallback: (1) Concept.selecteerEerstMessage if set, (2) relatedRiepr concept's definition/prefLabel, (3) generic Dutch instruction. Only tier 1 requires no code changes; tiers 2–3 still derive their text from existing codelist properties rather than being fully hardcoded strings.
  - **Impact:** The exact wording of gating messages cannot be changed without modifying source code.
  - **Status:** Partially resolved — added `selecteerEerstMessage` Concept property and derivation chain from relatedRiepr definitions. Full resolution requires adding explicit instructional rows to the CSV/source data alongside relevantRiepr declarations.
  - **Solution for future:** When adding a relevantRiepr declaration that gates children, also add a corresponding instructional entry (e.g., a note or dedicated message property) so the application can render it dynamically.

- **Issue ID**: ROOT-FIELD-CONDITIONAL-SIBLINGS
  - **Description:** In some schemes (e.g., grondstoffen), both the trigger field (`geproduceed`) and the conditional field (`grondstof`) are defined as top-level concepts in `hasTopConcept` with no `broader` relationship between them. They appear as independent sibling groups side-by-side. The conditionPath/conditionValue mechanism hides/shows the conditional field based on checkbox state, but because they share the same root level there is no visual grouping that shows "Grondstof" *under* "Geproduceerd?" — instead both always exist in the DOM (one may be hidden by CSS/Lit nothing). This differs from the expected parent-child relationship implied by the conditional dependency.
  - **Current implementation:** Root fields are sorted via `sortRootFieldsByConditionDependencies()` so conditional fields render AFTER their triggers, but they remain at the same hierarchical level (no nesting).
  - **Impact:** Users see two separate groups rather than a clear parent→child flow where child data is only available after answering the parent question.
  - **Status:** Open — requires either (a) adding explicit broader relationships in the codelist to make the conditional field truly nested under its trigger, or (b) implementing application-level grouping of conditional siblings under their trigger's card.
  - **Solution for future:** In the source CSV/data, define conditional fields as narrower children of their trigger concept rather than as top-level concepts with conditionPath annotations. This eliminates the need for special sorting logic and creates natural hierarchy.

## Issue Tracking Template
- **Issue ID**: Unique identifier
- **Description**: Problem description
- **Impact**: Severity and affected functionality
- **Status**: Open/In Progress/Resolved
- **Solution**: Proposed or implemented solution
