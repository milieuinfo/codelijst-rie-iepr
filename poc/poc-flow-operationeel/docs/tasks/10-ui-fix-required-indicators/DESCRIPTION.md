# Task: Add required field visual and accessible indicators

**Parent:** Epic 10 — Manual UI Review  
**Priority:** High  
**Related Issue:** A2  

## Problem
Fields with `isVerplicht=true` have no visible asterisk or "(verplicht)" text next to their labels. Screen readers may not announce them as required if `aria-required="true"` isn't present inside vl-* component shadow DOMs.

## Implementation Plan

### Step 1: Add visual asterisk in form labels
In `src/components/codelijst-operationeel-fields.ts`, modify all places where `<vl-form-label>` is rendered to append an asterisk when `required` is true:

```typescript
const labelWithIndicator = html`${plainLabel}${required ? html` <span aria-hidden="true" class="required-marker">*</span>` : ''}`
// Then use labelWithIndicator instead of plainLabel wherever passed as label prop
```

Add CSS for `.required-marker`:
```css
.required-marker {
  color: var(--vl-color-danger-50, #dc3545);
  font-weight: bold;
}
```

### Step 2: Ensure aria-required propagation
Check each vl-* control (`<vl-select>`, `<vl-input-field>`, `<vl-datepicker>`, `<vl-checkbox>`) to confirm the `?required="${required}"` Lit directive properly sets `aria-required="true"` on the internal focusable element. If the component library doesn't do this automatically, file a note about it but mark as "library dependency".

**Reference files:**
- `src/components/codelijst-operationeel-fields.ts` — line ~178 (relevantCodeList select), line ~210 (unit scheme select), line ~217 (checkbox), line ~220-222 (createControl)
- `src/services/field-control-factory.ts` — all control factory functions wrap labels
- `@domg-wc/components/form/select/vl-select.component.d.ts` — check if aria-required is documented
- `@domg-wc/components/form/input-field/vl-input-field.component.d.ts`
- `@domg-wc/components/form/datepicker/vl-datepicker.component.d.ts`
- `@domg-wc/components/form/checkbox/vl-checkbox.component.d.ts`

### DOD
- All fields with `isVerlicht=true` show a red asterisk next to their label
- The asterisk has `aria-hidden="true"` so screen readers don't announce it redundantly
- Build succeeds (`npm run build`)
- No new console warnings introduced
