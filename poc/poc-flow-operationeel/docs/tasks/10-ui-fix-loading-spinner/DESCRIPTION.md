# Task: Add loading spinner during codelist load

**Parent:** Epic 10 — Manual UI Review  
**Priority:** Low  
**Related Issue:** A7  

## Problem
During initial codelist load (~1–2 seconds), only static text "Codelijsten laden..." is shown without any visual feedback that progress is being made. On slower connections this could feel like a hang.

## Implementation Plan

In `src/components/codelijst-app.ts`, replace line 77:

```typescript
// Before:
? html`<p>Codelijsten laden...</p>`

// After:
? html`<div class="vl-margin--medium" style="text-align: center;">
    <vl-spinner></vl-spinner>
    <span class="sr-only">Codelijsten laden, even geduld...</span>
  </div>`
```

Check if `<vl-spinner>` exists in `@domg-wc/components`:
- Search `node_modules/@domg-wc/components/*/` for `spinner` or `loading` components
- If no vl-spinner exists, use a simple CSS animation with the design system's color tokens instead

### DOD
- Loading state shows animated indicator + message
- No layout shift when loading completes and form appears
- Build succeeds (`npm run build`)
