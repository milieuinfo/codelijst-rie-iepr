# Epic 03: Theme Selection UI Component

## AS IS

- No UI exists yet
- The user must select a theme from `thema-type` as the first step (per PROJECT_OUTLINE.md)
- `thema-type` has top concepts with optional narrower children:
  - Grondwater → Kinderen: Kwaliteitsmeting, Onttrekking/infiltratie, Peilmetingen
  - Lucht (geen kinderen)
  - Water (geen kinderen)
  - Zelfcontrole lucht (geen kinderen)
  - Zelfcontrole water (geen kinderen)

## TO BE

### Goals

Build the initial landing page where users select a theme (`thema`) and optionally drill down into sub-themes using SKOS narrower relations. This is the entry point of the application.

### In Scope

- Create `<codelijst-theme-selector>` Lit web component:
  - Displays a dropdown/select box labeled with the `thema-type` conceptscheme prefLabel ("Thema types" or similar)
  - Uses `vl-select` from flux-web-components for the dropdown
  - Shows available themes from `conceptscheme:thema_type` hasTopConcepts
  - If a selected theme has narrower children, show a secondary `vl-select` for sub-themes
  - All labels come from SKOS `prefLabel` (Dutch), fallback to `code` if missing
  - Emits a custom event `theme-select` with the selected concept ID when user makes a choice
- Wire up in the main app shell:
  - Render `<codelijst-theme-selector>` on initial load
  - Listen for `theme-select` event to trigger next phase (passing selected theme to parent)
- Handle edge cases:
  - Themes without narrower children should not show a secondary select
  - Empty or missing prefLabel falls back to code property
  - Multiple levels of nesting (if any exist beyond current data)

### Out of Scope

- Navigation history / browser URL state management
- Theme filtering or search within the selector
- Multi-select support at this level
- Visual theming beyond vl-* defaults

## DOD (Definition of Done)

- [ ] `<codelijst-theme-selector>` renders with all 5 top-level themes from thema-type
- [ ] Selecting "Grondwater" reveals a secondary dropdown with 3 sub-options
- [ ] Other themes (Lucht, Water, etc.) do not show a secondary dropdown
- [ ] Selected theme ID is emitted via `theme-select` custom event
- [ ] All labels are in Dutch (from SKOS prefLabel)
- [ ] Component uses only vl-* components (no custom CSS)
- [ ] No JavaScript console errors when component loads and interacts
- [ ] JSDoc on all public properties/events/methods
