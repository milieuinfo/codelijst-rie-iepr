# Epic 07: Validation & Quality Assurance

## AS IS

- No tests existed yet at the time this epic was planned.
- No HTML or JavaScript validation, no automated quality checks beyond manual browser inspection.
- This epic originally planned Cypress E2E tests (`poc/cypress/e2e/theme-selection.cy.ts`, `operation-flow.cy.ts`, `data-preview.cy.ts`), per PROJECT_OUTLINE.md's technical requirement of "Quick cypress tests to validate that everything loads".

## TO BE

**Tool substitution note**: this epic's actual implementation used **Playwright** instead of Cypress. `@playwright/test` and its config (`playwright.config.ts`) were already set up in the project, Playwright is functionally equivalent for this POC's "quick tests that validate everything loads" requirement, and the unused `cypress` devDependency has since been removed from package.json to avoid confusion. The actual test suite (`tests/codelijst.spec.ts`) and its results are the authoritative record — see **[docs/tasks/04-validation/DESCRIPTION.md](../04-validation/DESCRIPTION.md)** rather than duplicating that description here. `data-preview.cy.ts` was dropped entirely along with the `FormState`/data-preview feature it would have tested (see [docs/tasks/06-ui-components/DESCRIPTION.md](../06-ui-components/DESCRIPTION.md) — out of scope per PROJECT_OUTLINE.md).

### Goals

Ensure the POC application loads correctly without JavaScript or HTML errors, as required by PROJECT_OUTLINE.md.

### In Scope

- Automated Playwright suite covering app load, thema/sub-thema selection, operationeel field rendering, and a repeatable-field interaction, with a global console-error/pageerror listener that fails any test on an `error`-level console message or uncaught exception (see docs/tasks/04-validation/DESCRIPTION.md for the exact test list).
- ESLint configuration with JSDoc rules enabled, TypeScript strict mode, wired to `npm run lint`.
- `npm run build` (`tsc && vite build`) completing without errors as the build-validity check (substitutes for a separate standalone HTML5 validator - `index.html` is minimal and its correctness is exercised by every Playwright run).
- ISSUES.md updated with any findings from validation.

### Out of Scope

- Comprehensive unit test coverage (this is a POC, not production code).
- Performance benchmarking or load testing.
- Accessibility audit beyond vl-* component defaults.
- Cross-browser pixel-perfect visual regression testing.
- Cypress (superseded by Playwright, see note above).

## DOD (Definition of Done)

- [x] Automated test suite passes locally (`npm run test`) - see docs/tasks/04-validation/DESCRIPTION.md for the checklist of what it actually asserts.
- [x] No JavaScript console errors during full user flow traversal (enforced by the test suite itself, not just manually checked).
- [x] `npm run build` completes without errors.
- [x] ESLint reports zero warnings/errors on all source files (`npm run lint`).
- [x] ISSUES.md updated with findings from validation/implementation.
- [ ] Application works in Chrome and Firefox at minimum - only Chromium is configured/tested (`playwright.config.ts`); cross-browser coverage was not pursued for this POC.
