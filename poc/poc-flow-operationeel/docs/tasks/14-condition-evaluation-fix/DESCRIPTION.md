# Task 14: Fix Condition Evaluation — URI vs Plain Value Mismatch

**Status:** ✅ **COMPLETED**
**Priority:** High  
**Related Feedback:** #4 — "the condition: riepr-operationeel-grondstoffen:geproduceerd true does not work, even when the checkbox is false it shows"

## Problem

Fields with `conditionPath` / `conditionValue` are always rendered regardless of whether the referenced trigger field matches the expected value. The user reports that a checkbox field "Heeft u grondstoffen geproduceerd?" should gate child fields (like "Grondstof"), but those children show up even when the checkbox is unchecked (`false`).

### Root Cause

The JSON-LD codelist data stores `conditionValue` as a **full URI**, not a plain string:

```json
// From rie-iepr.jsonld line ~3526:
{
    "id": "riepr-operationeel-grondstoffen:grondstof",
    ...
    "conditionValue": [
        "concept:true"
    ],
    "conditionPath": [
        {
            "id": "riepr-operationeel-grondstoffen:geproduceerd",
            "_type": ["skos:Concept"],
            ...
        }
    ]
}
```

But `_onCheckboxChange` in `codelijst-operationeel-fields.ts` stores the checkbox state as a **boolean**:

```typescript
private _onCheckboxChange(event: CustomEvent<VlChangeEventDetail>) {
  const component = event.currentTarget! as VlCheckboxElement
  const id = component.id
  const checked = event.detail?.checked ?? component.checked
  this._fieldValues.set(id, checked) // Stores boolean true/false
}
```

Then `matchesCondition()` compares them as strings:

```typescript
if (stored !== undefined && String(stored) === field.conditionValue) return true
```

When user checks the box: `String(true)` → `"true"` ≠ `"concept:true"` ❌  
When user unchecks: `String(false)` → `"false"` ≠ `"concept:true"` ❌  

**Result:** Condition never matches → field always shows.

### Additional URI Patterns to Handle

The codelist may use various URI formats for condition values:
- `concept:true` — prefixed with namespace prefix
- `http://data.omgeving.vlaanderen.be/id/concept/true` — full URI
- `sh:true` — SHACL namespace prefix
- Plain `true` / `false` — simple literals (some fields may use these)

## Implementation Plan

### Step 1: Create a condition value normalizer
Create a helper function that extracts the meaningful local value from a condition value URI or plain string:

```typescript
/**
 * Extracts the effective comparison value from a conditionValue entry.
 * Handles URIs like "concept:true", "http://...#true", etc., and plain strings.
 */
function normalizeConditionValue(conditionValue: string): string {
  // If it's already a plain boolean-like string, return as-is
  if (/^(true|false)$/i.test(conditionValue)) return conditionValue.toLowerCase()
  
  // Try to extract local name from URI patterns:
  // - "concept:true" → "true"
  // - "http://...#true" → "true"
  // - "http://.../true" → "true"
  const hashMatch = conditionValue.match(/#[^#/]+$/)
  if (hashMatch) return hashMatch[0].substring(1).toLowerCase()
  
  const colonMatch = conditionValue.match(/:[^:/?#\n]+$/);
  if (colonMatch && !colonMatch[0].startsWith('://')) {
    return colonMatch[0].substring(1).toLowerCase()
  }
  
  // Fallback: use original value
  return conditionValue
}
```

### Step 2: Update CodelistService to store normalized values
In `codelist-service.ts`, when parsing `conditionValue` in `toConcept()`:

```typescript
const cvIds = this.idsOf(this.getValue(node, ['conditionValue', 'condition_value'])) ?? []
concept.conditionValue = cvIds.length > 0 ? normalizeConditionValue(cvIds[0]) : undefined
```

Or alternatively, keep the raw value and normalize at comparison time. The latter is safer since it doesn't change the stored data model. Let's go with normalization at parse time for simplicity.

### Step 3: Also normalize stored field values
When storing checkbox values, ensure they're stored as strings that match the normalized format:

```typescript
// In _onCheckboxChange:
this._fieldValues.set(id, String(checked).toLowerCase()) // "true" or "false"
```

And in `_onControlInput` for select/number fields, the value is already stringified via `String(...)`.

### Step 4: Improve matchesCondition robustness
Update the method to handle both exact and prefix-stripped comparisons:

```typescript
private matchesCondition(field: Concept): boolean {
  if (!field.conditionPath || !field.conditionValue) return true
  
  const refId = field.conditionPath
  let stored = this._fieldValues.get(refId)
  
  if (stored !== undefined) {
    // Direct match — compare normalized strings
    if (String(stored).toLowerCase() === field.conditionValue.toLowerCase()) return true
    
    // Also try matching against the original (non-normalized) conditionValue
    // in case the codelist uses plain "true"/"false" without URI prefixes
    const rawRef = this.result!.nodesById.get(refId)
    const rawCv = Array.isArray(rawRef?.['condition_value']) 
      ? String(rawRef['condition_value'][0]) 
      : String(rawRef?.['condition_value'] ?? '')
    if (rawCv && String(stored).toLowerCase() === rawCv.toLowerCase()) return true
  }
  
  // Check ALL stored values whose key starts with the base prefix
  // (handles repeatable fields on instances beyond #1)
  const basePrefix = refId.replace(/#\d+$/, '')
  for (const [key, val] of this._fieldValues.entries()) {
    if (key.startsWith(basePrefix)) {
      const normalizedVal = String(val).toLowerCase()
      if (normalizedVal === field.conditionValue.toLowerCase()) return true
      
      // Also check against raw value from source data
      const node = this.result!.nodesById.get(key.split('#')[0])
      const rawVals = Array.isArray(node?.['condition_value']) ? node['condition_value'] : [node?.['condition_value']]
      for (const raw of rawVals as string[]) {
        if (String(raw).toLowerCase() === normalizedVal) return true
      }
    }
  }
  
  return false
}
```

### Step 5: Add debug logging (dev only)
Add optional console.debug in `matchesCondition` when a condition fails so developers can trace mismatches during testing:

```typescript
if (!this.matchesCondition(field)) {
  console.debug(`[Codelijst] Field "${field.prefLabel ?? field.id}" hidden by condition: path="${field.conditionPath}", expected="${field.conditionValue}", got="${this._fieldValues.get(field.conditionPath)}"`)
}
```

## DOD
- Checkbox "Heeft u grondstoffen geproduceerd?" correctly gates child fields ("Grondstof") — children only show when checkbox is checked (`true`)
- Unchecking the checkbox hides gated children again
- Condition evaluation works for both URI-format values (`concept:true`) and plain-string values (`true`, `false`)
- Repeatable fields with conditions work across all instances (#1, #2, etc.)
- No regression on existing Playwright E2E tests
- `npm run build` succeeds
- No new console warnings (debug logs use `console.debug`, not `console.warn/error`)

## Files Changed
| File | Changes |
|------|---------|
| `src/services/codelist-service.ts` | Add `normalizeConditionValue()` helper; apply normalization in `toConcept()` |
| `src/components/codelijst-operationeel-fields.ts` | Update `_onCheckboxChange` to store lowercase string; update `matchesCondition()` to handle URI patterns; add debug logging |

## Implementation Summary

Added `normalizeConditionValue()` in `CodelistService.toConcept()` that extracts local comparison values from URI-format conditionValue entries:
- `"concept:true"` → `"true"` (strips prefix before colon)
- `"#fragment"` → fragment text without hash  
- `"/path/to/value"` → last path segment
- Plain `"true"`/`"false"` → unchanged, lowercased

Updated `_onCheckboxChange` to store checkbox state as lowercase string (`"true"` or `"false"`) instead of raw boolean. Updated `matchesCondition()` for case-insensitive string comparison.

Verified: grondstoffen theme — "Heeft u grondstoffen geproduceerd?" checkbox now correctly gates "Grondstof" group (only shows when checked).
