# Task: Make field names unique across composite groups

**Parent:** Epic 10 — Manual UI Review  
**Priority:** Medium  
**Related Issue:** A8  

## Problem
Fields like "Aard", "Naam", and "Verbruik" appear as labels in multiple composite groups (e.g., "Afvalproduct 1", "Verbruikte brandstof 1", "Geproduceerde stof 1"). Screen reader users navigating by form control name hear duplicate announcements without group context, making it impossible to distinguish which group a field belongs to.

## Implementation Plan

### Step 1: Prefix field labels with parent group info
In `src/components/codelijst-operationeel-fields.ts`, modify `renderFieldControl()` to include the parent field's prefLabel when called from within a composite group:

```typescript
private renderFieldControl(field: Concept, idSuffix: string) {
  // ... existing condition check ...
  
  const plainLabel = field.prefLabel ?? field.id
  
  // If this is a child of a composite group, prefix with parent label for uniqueness
  let accessibleLabel = plainLabel
  if (isComposite && field.id.includes(parentFieldId)) {
    accessibleLabel = `${parentField?.prefLabel} - ${plainLabel}`
  }
  // ... rest uses accessibleLabel instead of plainLabel for vl-form-label and vl-* controls
}
```

However, since `renderFieldControl` doesn't currently know its parent context, we need to pass it as an optional parameter:

```typescript
private renderFieldControl(field: Concept, idSuffix: string, parentGroupLabel?: string) {
  const plainLabel = field.prefLabel ?? field.id
  const accessibleLabel = parentGroupLabel ? `${parentGroupLabel} – ${plainLabel}` : plainLabel
  // Use accessibleLabel for all label props on vl-form-label and vl-* controls
  // Keep plainLabel for IDs (keep DOM IDs short and clean)
}
```

### Step 2: Pass parent label from renderRootField
In `renderRootField`, when rendering children inside a composite group:

```typescript
${children.map(child => this.renderFieldControl(child, suffix, field.prefLabel ?? field.id))}
```

### DOD
- Screen reader announces "Afvalproduct – Aard" instead of just "Aard"
- All fields across different groups have unique accessible names
- Native DOM IDs remain unchanged (short, using original concept IDs)
- Build succeeds (`npm run build`)
