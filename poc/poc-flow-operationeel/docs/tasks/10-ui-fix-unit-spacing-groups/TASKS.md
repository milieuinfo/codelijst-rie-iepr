# Subagent Task Assignments for Epic 10 Fixes

## Task A — Fix unit display + field spacing + group visual (codelijst-operationeel-fields.ts)
**File:** `src/components/codelijst-operationeel-fields.ts`  
**Scope:** All core logic changes in this one file  
**Includes:**
- Unit rendering: always call `renderWithUnit()` when a single Concept unit is found; add fallback text for unresolvable refs (`http://TODO`, missing unit IDs)
- Wrap each child field inside a composite group in `<div class="vl-margin--small">` so sibling label/control pairs have vertical spacing
- Add CSS class to outer root-field wrapper divs for grouping

## Task B — Add CSS styles (main.css)
**File:** `src/styles/main.css`  
**Scope:** New CSS additions only — no existing lines changed  
**Style rules to add:**
```css
/* Group card styling */
.codelijst-group {
  margin-bottom: var(--vl-spacing-layout-6);
  padding: var(--vl-spacing-layout-4);
  border: 1px solid var(--vl-color-gray-300);
  border-radius: var(--vl-border-radius-md);
  background: var(--vl-color-white);
}
.codelijst-repeatable-group {
  border-style: dashed;
  background: var(--vl-color-gray-50);
}

/* Unit addon styling */
.vl-input-group {
  display: flex;
  align-items: stretch;
}
.vl-input-addon {
  display: inline-flex;
  align-items: center;
  padding: var(--vl-spacing-form-control-padding-y) var(--vl-spacing-form-control-padding-x);
  background: var(--vl-color-gray-100);
  border: 1px solid var(--vl-color-border);
  border-radius: var(--vl-border-radius-control);
  font-size: var(--vl-font-size-sm);
  color: var(--vl-color-gray-700);
  min-width: 50px;
  justify-content: center;
}

/* Required marker */
.required-marker {
  color: var(--vl-color-danger-50, #dc3545);
  font-weight: bold;
}
```

## Task C — Add required field indicators (codelijst-operationeel-fields.ts + field-control-factory.ts)
**File:** `src/components/codelijst-operationeel-fields.ts`  
**Scope:** Append visual asterisk to labels when `required` is true  
**Details:**
- Create helper function that wraps plain label with optional `<span class="required-marker">*</span>`
- Apply across all rendering paths: relevantCodeList selects, unit scheme selects, checkboxes, createControl calls

## Task D — Handle empty operationeel schemes gracefully
**File:** `src/components/codelijst-operationeel-fields.ts`  
**Scope:** Fallback message in render() when rootFields.length === 0 and no structural pickers exist
