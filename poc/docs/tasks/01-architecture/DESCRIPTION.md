# Epic 01: Project Architecture & Scaffolding

## AS IS

- No TypeScript/Lit project exists yet in the poc directory
- package.json only has CSV and JSON-LD processing scripts (Node.js)
- No web component framework, bundler, or build system configured
- No folder structure for a frontend application
- Existing codebase is Java/Maven with JSON-LD codelist data embedded as resources

## TO BE

### Goals

Set up the foundational architecture for a NodeJS 25 + TypeScript 7 + Lit web components project that runs without a backend. The architecture must be generic enough to support future user flows.

### In Scope

- Initialize a Node.js project with TypeScript 7 configuration (`tsconfig.json`)
- Configure Vite or equivalent modern bundler for development and production builds
- Set up Lit as the web component framework
- Integrate `@milieuinfo/flux-web-components` (vl-* components) as the UI library
- Create a clean folder structure under `./poc/src`:
  - `src/components/` — custom Lit web components
  - `src/services/` — data reading/parsing services (JSON-LD, codelists)
  - `src/models/` — TypeScript interfaces/types derived from SKOS/DCAT patterns
  - `src/utils/` — shared utilities (i18n Dutch labels, helpers)
  - `src/pages/` — page-level composite components
  - `src/styles/` — minimal CSS using vl-* design tokens only
- Register the main app element (`<codelijst-app>`) in `index.html`
- Ensure the dev server runs locally with `npm run dev`
- Add ESLint with JSDoc rules for code documentation consistency
- Add basic Vitest test setup

### Out of Scope

- Backend / persistence layer
- Authentication / authorization
- Production deployment configuration (CI/CD is out of scope)
- Full accessibility audit (use vl-* defaults)
- Internationalization beyond Dutch/NL

### Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Bundler | Vite | Fast HMR, native ES modules, TypeScript support |
| Web Components | Lit | Framework used by flux-web-components, well-documented |
| UI Library | @milieuinfo/flux-web-components v2.16+ | Vlaanderen standard, vl-* components required |
| Language | TypeScript 7 | Strict typing needed for JSON-LD parsing |
| Testing | Vitest + Happy DOM | Already in project deps, fast and modern |
| Linting | ESLint + jsdoc plugin | Required by PROJECT_OUTLINE.md |

## DOD (Definition of Done)

- [x] `npm install` completes without errors
- [x] `npm run build` produces a working dist/ output
- [ ] `npm run dev` starts a local dev server accessible at localhost
- [x] Folder structure under `poc/src/` matches the specification above
- [x] TypeScript compiles with zero errors
- [ ] ESLint passes on all source files
- [x] `<codelijst-app>` custom element is registered and renders an empty shell page
- [ ] JSDoc comments present on all public class members and functions
- [ ] No custom CSS written — only vl-* component usage
