# Project Outline — RIE-IEPR Codelist POC

## Status: Refactoring in progress

The codelist (`rie-iepr.jsonld`) has been updated with a new interpretation model based on
`seeAlso` relationships instead of `relevantRiepr` for navigating between themes and operational
schemes. The PoC must be adapted to follow this new method.

See the root [`README.md`](../../../README.md), section **"Interpretatie"**, for the authoritative
specification of how the codelist should be interpreted.

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
