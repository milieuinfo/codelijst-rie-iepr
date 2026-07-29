# Epic 06: Form State Management & Data Binding

## AS IS

- No state management exists - this is purely a UI demonstration.
- The POC requires dummy/mock data for structural elements referenced by `relevantRiepr` (e.g. `riepr-meetpunt-type:debietmeter`).

## TO BE

### Goals / scope correction

This epic originally called for a `FormState` class collecting every field's value plus a `<codelijst-data-preview>` component showing that state as live JSON with a "Copy JSON" button. **That part is deliberately out of scope and will not be built.** PROJECT_OUTLINE.md lists persistence as explicitly out of scope ("Persistence, this is mainly a demonstration on how the code lists are interpreted to visualise the available selections and user flow") and none of its six numbered MVP user-flow steps ask for a data preview or a way to collect/export what the user typed. Adding a FormState layer that shadows every `<vl-input-field>`/`<vl-select>`/`<vl-checkbox>`/`<vl-datepicker>`'s own value, purely to render it back as JSON nobody asked for, would be overengineering for this POC. Fields are intentionally left uncontrolled (see AGENTS.md and `codelijst-operationeel-fields.ts`'s file-level doc comment).

The **mock data integration** part of this epic *is* in scope and *is* implemented: see `src/services/mock-data.service.ts`. `CodelijstOperationeelFields.renderStructuralPicker()` resolves a scheme's `relevantRiepr` to a structural type concept (e.g. debietmeter, meetpunt, installatie types) and renders a `<vl-select>` populated with `getMockInstances()`, seeded with realistic labels from the AGC Glass Europe example dataset (milieuinfo/RIE-IEPR) plus a generic numbered fallback for any type not explicitly seeded.

### Out of Scope

- `FormState` class / any client-side collection of entered field values (see rationale above).
- `<codelijst-data-preview>` / JSON preview / "Copy JSON" (see rationale above).
- Server-side persistence or API calls.
- Import/export to file download.
- Form validation beyond the `vl-*` components' own required-field indicators.
- Complex business rule validation, undo/redo, draft saving.

## DOD (Definition of Done)

- [x] Mock data exists for structural types referenced by `relevantRiepr` (meetpunt, installatie, emissiepunt, onttrekkingspunt types - see `mock-data.service.ts`'s `SEEDED_INSTANCES`), with a generic fallback for any unseeded type.
- [x] No TypeScript compilation errors in the mock-data service.
- [x] JSDoc on all public members.
- [x] `FormState`/data-preview scope is explicitly documented as out of scope (this file) rather than left as a silently-missing requirement.
