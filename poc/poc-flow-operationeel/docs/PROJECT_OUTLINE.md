# Project Outline — RIE-IEPR Codelist POC

## Current status: schema-driven table editor

The operational form has been replaced by editable Flux 2.22.0 rich data tables
consuming the same indexed JSON Schemas as the ODS generator. This supersedes
the historical raw-RDF navigation migration described below.
The [Dutch mapping guide](../../../README.md#van-csv-naar-json-schema-ui-en-ods)
is the conceptual specification; the [POC README](../README.md) covers operation.

### Contract and scope

- Discover available themes/sections from the generated index and show blocked
  sections with their actual source diagnostics.
- Flatten singleton detail objects into columns; render repeated child records
  as full-width expandable detail tables, and value/reference arrays as multiselects.
- Edit a source-shaped presentation while validating/exporting canonical
  `hasMember` and `additionalProperty` arrays, identified by `observedProperty`
  and `propertyID`. Required kinds retain discriminator-specific cardinalities.
- Preserve ownership without ODS parent-ID/link tables.
- Resolve generated conditions generically within the owning record/ancestors.
  Inactive fields are grey/disabled; retain drafts but omit inactive values from
  validated JSON.
- Cache drafts per reporting year and section in memory only.
- Validate the exact projected instance with the shared offline JSON Schema and
  semantic validators. Show errors at data paths/cells and JSON only on success.
- Verify indexed source/schema fingerprints; refuse stale or malformed input.
- Use RDF and CSOR only for labels and explicitly fictional structural references.
- Offer matching JSON Schema and blank ODS downloads; import filled current
  templates locally into editable drafts without a page reload.
- Offer both generic and personalized JSON Schemas. The personal schema supplies
  reference enums/labels for controls and structural validation; regenerate it
  from the active year's references and after a successful ODS import.
- Confirm replacement of existing input; reject incompatible schema/source
  fingerprints, invalid links/values and wrong-year references before replacement.
- Use compact controls, date-time pickers, value/unit cells and icon-only delete actions.
- No persistence/backend, domain calculations, feature construction or
  manufactured missing source facts.

The active scope is the three groundwater sections: quality, flow and levels.
The generator enters `conceptscheme:operationeel_grondwater` directly, not via
the removed theme list. Source `_table_workbook` / `_table_sheet` annotations
control the corresponding ODS layout, not semantic ownership.
Other operational CSVs and full Teepak acceptance remain outside this scope.

### Implementation surfaces

`schema-snapshot.ts`, `schema-editor.ts`, `schema-lookups.ts`,
`schema-rich-table.ts` and `codelijst-app.ts` form the active implementation.
The generator exposes shared browser-safe validation/index modules and a shared
snapshot sync used by the UI and ODS consumers. Legacy form components remain
unregistered. See [README.md](../README.md) for setup and checks.

## Historical pre-schema refactoring notes (superseded)

The following tasks document the prior RDF-form migration, not remaining tasks
or the current UI architecture. Published navigation is now `vervolgstap`
(`qb:codeList`), not the `seeAlso` described in these historical notes.

---

## Key Changes in New Codelist Format

| Aspect | Old Format | New Format |
|--------|-----------|------------|
| Theme → Scheme navigation | `relevantRiepr` on thema concepts points to operationeel scheme | `seeAlso` on thema concepts points to operationeel scheme |
| Multi-step flows within schemes | Not supported; each scheme was self-contained | Concepts use `seeAlso` to chain to sub-schemes after structural selection (e.g., lucht feature_bron → operationeel_lucht_rapportering) |
| Groundwater structure | Separate sub-themes in thema_type (kwaliteitsmeting, peilmeting, onttrekking) | Single groundwater theme; sub-types are composite concepts inside operationeel_grondwater |
| New properties | — | `isMultiselect`, `relevantClass` added to concept definitions |
| New intermediate schemes | — | `operationeel_lucht_rapportering`, `operationeel_water_lozing`, `operationeel_zelfcontrole_water_meting` |

---

## Tasks

### 01 — Sync script path fix ✅ DONE
The sync script resolved the repo root one level too shallow (`../src/` instead of `../../src/`).

**DOD:** `npm run predev` copies the latest codelist from parent project successfully.

---

### 02 — Data model: add seeAlso, isMultiselect, relevantClass
Extend `Concept` and `Scheme` interfaces in `skos-models.ts` to include:
- `seeAlso?: string[]` — links to another scheme or concept for multi-step flows
- `isMultiselect?: boolean | string` — indicates a structural picker allows multiple selections
- `relevantClass?: string` — SOSA class mapping (e.g., `sosa:Observation`, `sosa:FeatureOfInterest`)

Update `CodelistService.toConcept()` to parse these fields from JSON-LD nodes.

Add a new service method `getSeeAlsoRefs(result, node)` that resolves `seeAlso` references to their target Scheme or Concept objects.

**DOD:** All new properties are parsed correctly; unit tests pass.

---

### 03 — Theme selector: use seeAlso instead of relevantRiepr
The theme selector currently reads `relevantRiepr` on thema concepts to find the operationeel scheme.
This must change to read `seeAlso` instead.

Changes needed in `codelijst-app.ts`:
- Replace `getRelevantRieprRefs()` with `getSeeAlsoRefs()` when resolving the operationeel scheme from the selected theme/sub-theme

The sub-thema mechanism via `narrower` can remain as-is since the groundwater sub-themes have been
consolidated into the main scheme. The narrower-based sub-selector should still work for any future
themes that define children.

**DOD:** Selecting a theme navigates to the correct operationeel scheme via `seeAlso`.

---

### 04 — Multi-step flow support (seeAlso chaining)
When an operational concept has `seeAlso` pointing to another scheme, selecting a structural element
for that concept should transition to the referenced sub-scheme.

Example flow (Lucht):
1. User selects thema "lucht" → resolves to `operationeel_lucht` via `seeAlso`
2. Operationeel lucht shows: Emissiepunt picker + Bron(nen) picker
3. After selecting bron(nen), `feature_bron`'s `seeAlso` points to `operationeel_lucht_rapportering`
4. App transitions to render fields from `operationeel_lucht_rapportering` (brandstof, verbruikte_stof, ...)

Implementation approach:
- `codelijst-app.ts`: track a `flowStack` array of `{schemeId, triggerConceptId}` representing the
  current navigation path through seeAlso chains
- When a structural field with `seeAlso` is selected and has a value, push the target scheme onto the stack
- Render either the base operationeel fields OR the chained sub-scheme depending on stack depth
- Add back-navigation (breadcrumbs or back button) when in a sub-flow
- `isMultiselect` fields show multi-select pickers; all selections must be made before transitioning

**DOD:** Lucht theme flows through feature selection → data entry correctly. Water and zelfcontrole themes work similarly.

---

### 05 — isMultiselect support
Fields marked `isMultiselect: "true"` should render as multi-select dropdowns instead of single-select.

Changes needed in `codelijst-operationeel-fields.ts`:
- Detect `field.isMultiselect === true` on structural picker concepts
- Render `<vl-select multiple>` or equivalent for these fields
- Track multiple values per field in `_fieldValues` / `structuralSelections`
- Gate logic: ALL multiselect items must have at least one selection to proceed

**DOD:** Multiselect structural pickers render and track multiple values. Gating respects multiselect state.

---

### 06 — relevantClass awareness (future-proofing)
The new codelist marks concepts with `relevantClass` indicating SOSA class mapping:
- `sosa:FeatureOfInterest` = structural element (installation, emission point, ...)
- `sosa:Observation` = observable data point (fuel consumption, material usage, ...)

This does not change the UI but should be tracked for future backend integration. No immediate
visual changes required — just ensure the property is parsed and available.

**DOD:** `relevantClass` is correctly parsed into Concept objects and accessible via service methods.

---

### 07 — Groundwater flow adaptation
Groundwater no longer has separate sub-themes. Instead, the single "grondwater" theme resolves to
`operationeel_grondwater` which contains composite concepts: `kwaliteitsmeting`, `peilmeting`,
`onttrekking/infiltratie`. Each is a top-level composite inside that scheme.

Verify this renders correctly after the seeAlso migration — no code changes may be needed beyond
task 03 since these are now standard composite fields within one scheme.

**DOD:** Grondwater theme renders all three measurement types as composite groups in a single form.

---

### 08 — Cleanup & verification
- Remove temporary `rie-iepr-new.jsonld` comparison file
- Run full build (`npm run build`) and verify no TypeScript errors
- Run unit tests (`npm run test:unit`) and playwright tests (`npm run test`)
- Verify all five themes load correctly: grondstoffen, grondwater, lucht, water, zelfcontrole-lucht, zelfcontrole-water
- Update AGENTS.md to document the new seeBased navigation model
- Update docs/ARCHITECTURE.md if it exists with notes on multi-step flows

**DOD:** All builds pass, all tests pass, all themes render correctly, documentation updated.
