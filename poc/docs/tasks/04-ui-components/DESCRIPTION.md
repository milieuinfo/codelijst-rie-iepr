# Epic 04: Operationeel Flow & Composite Attributes UI

## AS IS

- After theme selection, no further navigation exists
- The selected theme maps to an operationeel conceptscheme via `relevantRiepr`:
  - e.g., Grondwater → `riepr-operationeel-grondwater`, Lucht → `riepr-operationeel-lucht`
- Within each operationeel scheme, some concepts have narrower children representing composite attributes
- Example from `operationeel_lucht`: "Verbruikte stof" has children Aard, Hoeveelheid, Naam
- Each leaf property has metadata: relevantDataType, relevantCodeList, isVerplicht, isMeervoudig, relevantRiepr

## TO BE

### Goals

Build the main data entry flow that unfolds after a theme is selected. This includes displaying composite attribute groups (narrower relations in operationeel schemes) and their leaf properties with appropriate input controls based on relevantDataType.

### In Scope

- Create `<codelijst-operationeel-fields>` Lit web component:
  - Receives selected theme ID as a property
  - Resolves to the corresponding operationeel conceptscheme using CodelistService
  - For each top-level concept in the operationeel scheme, render it as a section/card
  - If the concept has narrower children, expand those as sub-fields within the card
  - Apply SKOS hierarchy traversal for any additional nesting levels
  
- Property rendering based on `relevantDataType`:
  | Data Type | UI Control | Component |
  |---|---|---|
  | xsd:string | Text input | `vl-text-field` |
  | xsd:decimal / xsd:integer | Number input | `vl-number-field` |
  | xsd:date | Date picker | `vl-date-picker` |
  | sosa:Procedure / adms:* | Selection from code list | `vl-select` + relevantCodeList |
  
- Handle `isVerplicht` ("true" string):
  - Add required validation indicator on the field
  - Prevent form submission if empty (when we have form structure)
  
- Handle `isMeervoudig` ("true"/"false"):
  - When true, show an "Add another" button to duplicate the composite group
  - Each instance maintains its own data binding
  
- Handle `relevantRiepr`:
  - Store/reference the RIEPR type URI for mock data lookup later
  - Display a hint/label with the relevant system type name

### Out of Scope

- Actual database queries using relevantRiepr (mock data only)
- Real-time validation beyond HTML5 browser defaults
- Undo/redo functionality
- Drag-and-drop reordering of repeated items

## DOD (Definition of Done)

- [ ] Selecting theme "Lucht" renders operationeel_lucht concepts as sections
- [ ] Composite attributes (e.g., Verbruikte stof → Aard, Hoeveelheid, Naam) are displayed correctly
- [ ] Number fields render for xsd:decimal/xsd:integer properties
- [ ] Text fields render for xsd:string properties
- [ ] Date picker renders for xsd:date properties
- [ ] Selection dropdowns render when relevantCodeList is present
- [ ] Required fields (isVerplicht=true) show required indicator
- [ ] Multiple-entry fields (isMeervoudig=true) allow adding additional instances
- [ ] No JavaScript errors in console during full interaction flow
- [ ] All labels from SKOS prefLabel, Dutch language throughout
