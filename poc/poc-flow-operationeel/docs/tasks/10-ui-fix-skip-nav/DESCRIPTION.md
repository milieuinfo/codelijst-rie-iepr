# Task: Add skip-navigation link

**Parent:** Epic 10 — Manual UI Review  
**Priority:** Medium  
**Related Issue:** A1  

## Problem
No skip-navigation link exists. Users tabbing through the page must navigate past `<h1>RIE-IEPR Codelijst POC</h1>` and descriptive paragraph text before reaching form controls. This violates WCAG 2.1 Success Criterion 2.4.1 (Bypass Blocks).

## Implementation Plan

### Step 1: Add skip link to shadow DOM of codelijst-app
In `src/components/codelijst-app.ts`, add a skip-link element at the very top of the render template:

```typescript
static override styles = [
  css`
    :host { display: block; }
    .skip-link {
      position: absolute;
      left: -9999px;
      top: auto;
      width: 1px;
      height: 1px;
      overflow: hidden;
      color: #fff;
      background: #000;
      padding: 0.5rem 1rem;
      z-index: 10000;
      font-weight: bold;
      text-decoration: underline;
    }
    .skip-link:focus {
      position: fixed;
      left: 1rem;
      top: 1rem;
      width: auto;
      height: auto;
      overflow: visible;
      color: #fff;
      background: #0d6efd;
    }
  `,
  vlMarginStyles,
  layoutStyle,
]
```

### Step 2: Render skip link before content
Add to the render method, inside `<div class="vl-page">`:

```html
<a href="#codelijst-main-content" class="skip-link">Inhoud overslaan</a>
<main id="codelijst-main-content" class="vl-main-content">
  ...
</main>
```

Note: Since this is in a Lit component's shadow DOM, the `href` target must also be within the same shadow DOM (which it will be since `<main>` is rendered there).

### DOD
- Pressing Tab on page load focuses "Inhoud overslaan" link immediately
- Link appears at top-left of viewport when focused
- Focus jumps directly to form controls when activated
- Works with keyboard-only navigation and screen readers
- Build succeeds (`npm run build`)
