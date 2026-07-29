# Task 10b: Fix Unit Display, Field Spacing, and Group Visual Clarity

**Parent:** Epic 10 — Manual UI Review  
**Priority:** High  
**Related Issues:** A2, A3, A6 (from original review) + new findings  

## Problem Summary

Three interrelated UX/CSS issues were found during hands-on testing:

### Issue 1 — Units not displayed on numeric fields
Fields with `relevantUnit` that resolve as single **Concepts** (e.g., `unit:M`, `unit:DAY`, `qudt-unit:GigaJ`) render their inputs without any unit indicator next to them. The user sees "Jaarvracht" with an empty number input but has no idea what unit is expected. Only units resolving as **Schemes** get dropdown treatment; all Concept-unit cases silently drop through to plain `<vl-input-field>` rendering.

**Evidence from DOM inspection:**
```html
<!-- Expected: <div class="vl-input-group">...<span class="vl-input-addon">Meter</span></div> -->
<!-- Actual: just the form-label + vl-input-field side by side -->
<vl-form-label block="" for="riepr-operationeel-water:lozing-debiet" label="Debiet per jaar"></vl-form-label>
<vl-input-field type="number" id="riepr-operationeel-water:lozing-debiet" ... value=""></vl-input-field>
```

**Root cause:** In `codelijst-operationeel-fields.ts` lines 184–202, when iterating over `unitIds`:
- If a Scheme is found → sets `isUnitScheme = true` and breaks (correct)
- If only Concepts are found → sets `singleUnitConcept` correctly  
But in `renderWithUnit()` (line 231), it checks `if (!unitConcept)` — which should work for single-concept units. The real issue is that fields with `http://TODO` or unresolvable unit IDs have **no** `singleUnitConcept`, so they fall through with no indicator at all. Additionally, some valid unit concepts like `unit:M3-PER-YR` aren't in the codelist document, so they also resolve to nothing.

**Fix plan:**
1. In `renderFieldControl()`, after finding `singleUnitConcept`, always render via `renderWithUnit()` regardless of whether there's also a scheme match.
2. For unresolvable unit refs (`http://TODO`, `qudt-unit:*` not in doc), append the raw ID as fallback text (e.g., "M³/jaar" if the concept has code `M3-PER-YR`).
3. Add `.vl-input-addon` styling inside `renderWithUnit()` using design-system tokens:
```css
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
```

### Issue 2 — Fields within composite groups too close together  
Inside `<vl-fieldset>` groups, individual field rows (form-label + control pairs) have no vertical spacing between them. They appear stacked tightly with only whitespace from Lit's template rendering. The design system provides utility classes (`vl-margin--small`, etc.) but they're only applied to the outer root-field wrapper divs, not to sibling fields within a group.

**Evidence:** DOM shows consecutive `<vl-form-label>...<vl-input-field>...</vl-input-field>` pairs with zero margin/padding between them inside the native `<fieldset>` element.

**Fix plan:**
In `codelijst-operationeel-fields.ts` line ~139 where children are rendered:
```typescript
${children.map(child => html`
  <div class="vl-margin--small">
    ${this.renderFieldControl(child, suffix)}
  </div>
`)}
```
Wrap each child field in its own spaced container so labels and controls don't visually merge.

### Issue 3 — Grouped elements don't look like groups
The `<vl-fieldset>` component renders slotted content (the legend span text like "Abnormale lozing 1") but has **no visible border, background color, or rounded corners**. Combined with the missing internal field spacing (Issue 2), users cannot easily distinguish where one group ends and the next begins.

**Evidence:** Native `<fieldset>` computed styles show `border: 0px none rgb(51, 51, 50)`, `margin: 0px`, `padding: 0px`. The vl-fieldset custom component doesn't apply any visual styling to differentiate it from plain divs.

**Fix plan:**
Add subtle visual grouping via CSS on the outer root-field wrapper. Since we can't style inside `@domg-wc/components`' shadow DOM, use the parent `<div class="vl-margin--medium">` that wraps each root field to add a card-like appearance:

```css
.codelijst-group {
  margin-bottom: var(--vl-spacing-layout-6);
  padding: var(--vl-spacing-layout-4);
  border: 1px solid var(--vl-color-gray-300);
  border-radius: var(--vl-border-radius-md);
  background: var(--vl-color-white);
}
```

Apply this class to each root field wrapper in `render()`:
```typescript
${rootFields.map(field => html`
  <div class="codelijst-group ${isRepeatable ? 'codelijst-repeatable-group' : ''}">
    ${this.renderRootField(field)}
  </div>
`)}
```

For repeatable groups (multiple instances of same field), add a lighter/dashed border variant:
```css
.codelijst-repeatable-group {
  border-style: dashed;
  background: var(--vl-color-gray-50);
}
```

## Implementation Files

| File | Changes |
|------|---------|
| `src/components/codelijst-operationeel-fields.ts` | Fix unit rendering logic, wrap child fields in spaced containers, add grouping wrapper divs with CSS class |
| Component-scoped CSS (in `static override styles`) | Added `.codelijst-group`, `.codelijst-repeatable-group`, `.codelijst-group__child`, `.codelijst-group__item`, `.vl-input-group`, `.vl-input-addon` styles; no global CSS changes |

## Additional Fixes Applied During Session

## DOD
- All numeric fields with resolvable units show the unit code as an addon next to the input (e.g., "Debiet per jaar [M³/jaar]")
- Fields within composite groups have visible vertical spacing (~8–12px) between label/control pairs
- Each root field group has a subtle border/background making it visually distinct from adjacent groups
- Repeatable groups are visually distinguishable (dashed border or different background)
- Build succeeds (`npm run build`)
- No new console warnings introduced
- Works across all themes (Lucht, Water, Grondwater, Zelfcontrole lucht/water)

---

## Additional Fixes Applied During Session

### Issue 4 — Empty groups rendered when hidden by conditionPath/conditionValue
Root field `<div class="codelijst-group">` wrappers were always rendered even when all child fields inside were hidden by conditional visibility rules. This left empty bordered cards on screen.

**Fix:** Refactored `renderRootField()` into a two-step process:
- `renderRootFieldContent(field)` returns `{ content: html, repeatable: boolean } | nothing`
- In `render()`, filter out `nothing` results before wrapping in group divs
- Also added early return in instance loop when composite children are all hidden

### Issue 5 — Groups too close together; internal spacing insufficient
The original card-style borders had adequate vertical margin between groups but no consistent gap strategy for items inside the card. Fields within composite groups (fieldsets) lacked proper vertical breathing room from each other and from the card border itself.

**Fix:**
- Added `display: flex; flex-direction: column; gap: var(--vl-spacing-layout-3);` to `.codelijst-group` for automatic consistent spacing
- Created `.codelijst-group__child` class for spacing between sibling fields inside fieldsets
- Removed redundant `vl-margin--small` wrappers in favor of CSS gap + scoped classes
