# Component catalog

Catalog of this POC's custom Lit components. For the `vl-*` (`@domg-wc/components`)
elements they render, the authoritative API reference is the `.component.d.ts` /
`static get properties()` in `node_modules/@domg-wc/components/**` - this file
only lists which ones each component uses, not their full prop surface.

## `<codelijst-app>`

`src/components/codelijst-app.ts` - root element, mounted once in `index.html`.

- **Properties**: none (all state is private/internal).
- **Events**: listens for `theme-select` (bubbled from `<codelijst-theme-selector>`).
- **Renders**: `<vl-alert>` (load error), `<vl-fieldset>`, `<codelijst-theme-selector>`, `<codelijst-operationeel-fields>`.
- **Responsibility**: loads the codelist once via `CodelistService.loadCodelist()`, tracks the selected thema/sub-thema, and resolves which operationeel-* scheme to render via `relevantRiepr` on the selected (sub-)thema concept.

## `<codelijst-theme-selector>`

`src/components/codelijst-theme-selector.ts` - step 1 of the user flow.

- **Properties** (all `attribute: false`, set via property binding):
  - `result: CodelistResult | undefined` - the parsed codelist.
  - `selectedThemeId: string | undefined`
  - `selectedSubThemeId: string | undefined`
- **Events**: fires `theme-select`, `detail: { themeId, subThemeId }`, on every thema or sub-thema change.
- **Renders**: `<vl-select id="thema">` (top concepts of `conceptscheme:thema_type`), and `<vl-select id="sub-thema">` when the selected thema has narrower children.

## `<codelijst-operationeel-fields>`

`src/components/codelijst-operationeel-fields.ts` - steps 2-6 of the user flow.

- **Properties** (`attribute: false`):
  - `result: CodelistResult | undefined`
  - `schemeId: string | undefined` - the operationeel-* conceptscheme id to render.
- **Events**: none (uncontrolled fields, no persistence - see AGENTS.md).
- **Renders**:
  - `<vl-select>` structural-instance picker(s) when the scheme's own `relevantRiepr` points at a structural type concept (mock data via `mock-data.service.ts`).
  - `<vl-fieldset>` + `<span slot="legend">` per composite root field, wrapping its children's controls.
  - Per leaf field, one of `<vl-select>` (relevantCodeList), `<vl-checkbox>` (`xsd:boolean`), `<vl-datepicker>` (`xsd:date`/`xsd:dateTime`), or `<vl-input-field type="number"|"text">` (everything else), each with `?required` from `isVerplicht`.
  - `<vl-button secondary>` "+ Nog ... toevoegen" / "Verwijder" for `isMeervoudig` fields, backed by an internal `repeatCounts: Map<string, number>`.
