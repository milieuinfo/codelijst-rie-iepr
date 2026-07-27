# Epic 05: Code List Selection & Unit Display

## AS IS

- `relevantCodeList` on many property concepts references another conceptscheme that should populate a selection dropdown.
- Example: "Lozingsplaats" has `relevantCodeList: ["conceptscheme:lozingspunt_lozingsplaats"]`.
- `relevantUnit` provides the unit for numeric values (e.g., a code from `conceptscheme:eenheden` like "m", "°C", "MW", "mg/l").

## TO BE

### Goals

Resolve `relevantCodeList` into a selection dropdown, and show units alongside numeric fields.

### Implementation note (deviation from original plan)

This epic originally planned a standalone `<codelijst-code-list-selector>` component with a `codeListId` property. It was implemented instead as a rendering branch inside `codelijst-operationeel-fields.ts`'s private `renderFieldControl` method: a single `<vl-select>` populated via `CodelistService.getCodeListSchemes()` + `getTopConceptsForScheme()`. A field with `relevantCodeList` has no behavior independent of the rest of the field-rendering switch (data type, required, repeatable all apply the same way), so extracting it into its own component would be pure indirection at this POC's scale - it would be overengineering per PROJECT_OUTLINE.md's guardrail against unnecessary custom abstraction. See `docs/COMPONENTS.md` for the actual component list.

Unit display similarly has no dedicated component: `renderFieldControl`'s private `labelWithUnit()` helper resolves `relevantUnit[0]` to its `Concept.code` and appends it to the field's label (e.g. "Verbruik (GJ)") rather than a separate addon/slot component.

**Also note**: this task's original "Handle edge cases" bullet said unresolvable code lists should "fall back to showing a text input instead" - that's not what PROJECT_OUTLINE.md actually asks for. The outline's literal instruction is to "silently ignore this error but still show a selection", so the implementation renders an (empty, placeholder-only) `<vl-select>` in that case, not a text input. See `ISSUES.md` (`CODELIST-UNRESOLVABLE-REFS`) for the concrete unresolvable refs found in the data.

### In Scope

- Code-list-driven `<vl-select>` rendering (implemented, see above).
- Unit suffix on field labels (implemented, see above).
- Graceful handling of unresolvable/TODO `relevantCodeList` refs (implemented: empty selection, not an error).
- Multiple `relevantCodeList` entries per field: options are merged from every resolved scheme.

### Out of Scope

- Dynamic code list loading from remote sources.
- Search/filter within large code lists (>50 items).
- Multi-select for code lists.
- Code list versioning.

## DOD (Definition of Done)

- [x] Fields with a resolvable `relevantCodeList` render a `<vl-select>` populated from the referenced conceptscheme's top concepts.
- [x] Numeric fields show their associated unit code as a label suffix (e.g. "Verbruik (GJ)").
- [x] Inaccessible/TODO code lists degrade to an empty (placeholder-only) selection, not an error - per PROJECT_OUTLINE.md, not a text-input fallback.
- [x] Fields with multiple `relevantCodeList` entries show merged options from all of them.
- [x] All selection labels come from SKOS `prefLabel` (falling back to the concept id).
- [x] No console errors when resolving any code list reference in the dataset (verified by the Playwright suite, see docs/tasks/04-validation/DESCRIPTION.md).
- [x] JSDoc on all public members (enforced by `npm run lint`, see `.eslintrc.cjs`).
