# Task: Handle empty operationeel schemes gracefully

**Parent:** Epic 10 — Manual UI Review  
**Priority:** Medium  
**Related Issue:** A6  

## Problem
When a theme resolves to an operationeel scheme with zero `hasTopConcept` entries (e.g., `grondwater-kwaliteitsmeting` → `conceptscheme:operationeel_grondwater_kwaliteitsmeting`), the UI renders an empty `<vl-fieldset>` with legend "Operationele gegevens" and no visible fields — confusing for users.

## Root Cause
The source codelist data (`rie-iepr.jsonld`) simply doesn't define `hasTopConcept` for some conceptschemes. The code correctly returns `[]` from `getTopLevelConcepts()` but the render function doesn't handle this case — it just produces nothing inside the fieldset.

## Implementation Plan

### Step 1: Add fallback message for empty schemes
In `src/components/codelijst-operationeel-fields.ts`, modify the `render()` method:

```typescript
override render() {
  if (!this.result || !this.schemeId) return nothing

  const scheme = this.result.schemes.get(this.schemeId)
  if (!scheme) return nothing

  const rootFields = this._service.getTopLevelConcepts(this.result, this.schemeId!)

  // Handle empty scheme gracefully
  if (rootFields.length === 0 && !this.renderStructuralPicker(scheme)) {
    return html`<p class="vl-margin--small">Voor dit thema zijn geen operationele velden gedefinieerd in de codelist.</p>`
  }

  return html`
    ${this.renderStructuralPicker(scheme)}
    ${rootFields.map(field => html`<div class="vl-margin--medium">${this.renderRootField(field)}</div>`)}
  `
}
```

### DOD
- Selecting a theme that resolves to an empty scheme shows a friendly Dutch message instead of an empty fieldset
- No other themes are affected — existing behavior unchanged
- Build succeeds (`npm run build`)
