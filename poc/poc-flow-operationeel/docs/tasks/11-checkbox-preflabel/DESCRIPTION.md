# Task 11: Fix checkbox prefLabel visibility

**Status:** ✅ **COMPLETED**
**Priority:** High  
**Related Feedback:** #1 — "when xsd:boolean is used a checkbox is shown, but the prefLabel is missing next to the checkbox"

## Implementation Summary

Changed boolean checkbox rendering in `renderFieldControl()` (line ~354) from inline `label` prop on `<vl-checkbox>` to an explicit `<vl-form-label>` + `<vl-checkbox>` pattern matching how all other field types render labels.

```typescript
// Before:
html`<vl-checkbox id="${id}" name="${id}" label="${displayLabel}" ?required="${required}">`

// After:
const formLabel = html`<vl-form-label for="${id}" label="${displayLabel}" block></vl-form-label>`
return html`${formLabel}<vl-checkbox id="${id}" name="${id}" ?required="${required}">`
```

This ensures consistent label display alongside checkboxes. The vl-checkbox component's internal shadow-DOM handling of its `label` attribute differs from other form controls; using an explicit `<vl-form-label>` provides reliable visible text.

## Problem

Fields with `relevantDataType=xsd:boolean` (e.g., "Heeft u grondstoffen geproduceerd?") render as `<vl-checkbox>` controls, but users report the label text does not appear visibly next to the checkbox control in the UI. The `label` attribute is set on the component (`label="${displayLabel}"`) but either the vl-checkbox component ignores it for display purposes or the rendering produces no visible text alongside the input.

## Root Cause Analysis

In `src/components/codelijst-operationeel-fields.ts` line 306:

```typescript
return html`<vl-checkbox id="${id}" name="${id}" label="${displayLabel}" ?required="${required}" @vl-change="${this._onCheckboxChange}"></vl-checkbox>`
```

Unlike other field types that wrap a separate `<vl-form-label>` + control pair, boolean fields pass the label directly to the `label` prop of `<vl-checkbox>`. The `@domg-wc/components/form/checkbox` web component may handle its internal label differently than other form controls — some vl-* components expect labels via slot content rather than attributes, while others use shadow-DOM-internal label rendering that depends on specific prop names or CSS classes.

## Investigation Required

1. Check `node_modules/@domg-wc/components/form/checkbox/*.component.d.ts` for the component's property and slot signatures — specifically how `label`, `block`, and annotation are handled by vl-checkbox.
2. Test in dev server with browser inspector to confirm whether the label is present in the DOM or shadow DOM but hidden/invisible, or absent entirely.
3. If the component uses slots for label content, switch from attribute to slotted rendering.
4. If the component ignores `label` for display (using it only for accessibility), add an explicit `<vl-form-label>` alongside the checkbox.

## Implementation Plan

### Step 1: Research vl-checkbox API
Read TypeScript declarations for `@domg-wc/components/form/checkbox` to find the correct way to render a visible label next to a checkbox.

### Step 2: Fix rendering
Depending on findings, one of these approaches:

**Option A — If vl-checkbox supports label prop for display:**
Ensure the `label` prop is correctly passed and no CSS overrides hide it. May need to add `block=""` attribute for full-width layout consistency with other fields.

```typescript
return html`<vl-checkbox id="${id}" name="${id}" label="${displayLabel}" block ?required="${required}" @vl-change="${this._onCheckboxChange}"></vl-checkbox>`
```

**Option B — If vl-checkbox expects slot-based labels:**
Switch to slotted label pattern:

```typescript
return html`
  <div class="vl-margin--small">
    <span>${plainLabel}${required ? ' *' : ''}</span>
    <vl-checkbox id="${id}" name="${id}" ?required="${required}" @vl-change="${this._onCheckboxChange}"></vl-checkbox>
  </div>
`
```

**Option C — If neither works, use explicit form-label + checkbox:**

```typescript
const displayLabel = plainLabel + (required ? ' *' : '')
return html`
  ${html`<vl-form-label for="${id}" label="${displayLabel}" block></vl-form-label>`}
  ${html`<vl-checkbox id="${id}" name="${id}" ?required="${required}" @vl-change="${this._onCheckboxChange}"></vl-checkbox>`}
`
```

### Step 3: Verify across all boolean fields
Test with "Heeft u grondstoffen geproduceerd?" and any other xsd:boolean fields in the codelist.

## DOD
- Boolean fields show their prefLabel visibly next to the checkbox control
- Required indicator (`*`) appears on required boolean fields
- Layout is consistent with other field types (labels above or beside controls per design system convention)
- No new console warnings introduced
- `npm run build` succeeds

## Files Changed
| File | Changes |
|------|---------|
| `src/components/codelijst-operationeel-fields.ts` | Fix boolean checkbox rendering (line ~304–307) |
