# Architecture Documentation

## Overview

This proof of concept demonstrates how RIE-IEPR codelists are read and visualized using modern web technologies.

## Tech Stack

- **Node.js 25** - Runtime environment
- **TypeScript 7** - Static typing and tooling
- **Vite** - Build tool and development server
- **Lit** - Web component framework
- **@domg-wc/components (vl-*)** - Vlaanderen UI component library (installed via private Artifactory registry, see `.npmrc`)

## Project Structure

```
poc/
├── src/
│   ├── components/     # Lit web components
│   │   └── *.ts       # Individual component implementations
│   ├── services/       # Data services
│   │   └── codelist-service.ts  # Codelist parsing and querying
│   ├── models/         # TypeScript interfaces and types
│   │   └── skos-models.ts       # SKOS/RDF data models
│   ├── pages/          # Page-level components (none yet)
│   └── styles/         # CSS styles (minimal, using vl-* tokens)
├── docs/
│   └── tasks/          # Task epics and documentation
├── dist/               # Build output (generated)
├── index.html          # Main HTML entry point
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── vite.config.js      # Vite configuration
```

## Core Services

### CodelistService

Located in `src/services/codelist-service.ts`, this service handles:
- Loading JSON-LD codelist files from the filesystem
- Parsing SKOS concepts and schemes
- Expanding inline concept definitions
- Resolving broader/narrower relationships
- Normalizing boolean values stored as strings

**Key Methods:**
- `loadCodelist()` - Fetch and parse the entire codelist
- `getSchemes()` - Get all concept schemes
- `getConceptsForScheme()` - Get concepts for a specific scheme
- `getTopConceptsForScheme()` - Get top-level concepts
- `getChildren()` - Get narrower (child) concepts
- `getParent()` - Get broader (parent) concept

## Data Models

See `src/models/skos-models.ts` for TypeScript interfaces:

- **Concept** - Represents a SKOS concept with properties like prefLabel, broader, narrower, relevantDataType, etc.
- **Scheme** - Represents a SKOS concept scheme containing related concepts

## User Flow (MVP)

1. **Theme Selection** (`codelijst-theme-selector`)
   - User selects a theme from the `thema-type` codelist
   - If the theme has narrower relations (children), a sub-selection appears
   - Emits `theme-select` event with selected IDs

2. **Operationeel Flow** (`codelijst-operationeel-fields`)
    - Once a theme is selected, the relevantRiepr property of the thema/sub-thema Concept resolves to an operationeel-* ConceptScheme
    - Root fields are `hasTopConcept` entries without a `broader` reference; composite children (with `broader` set) are grouped under their parent
    - Field controls mapped from relevantDataType: `xsd:boolean` → `<vl-checkbox>`, date/time → `<vl-datepicker>`, numeric → `<vl-input-field type="number">`, text → `<vl-input-field type="text">`
    - Fields with relevantCodeList render as `<vl-select>` populated from the referenced conceptscheme's top concepts; external/unresolved refs silently show an empty select per POC data-quality rules
    - Scheme-level relevantRiepr triggers a structural-instance picker (mock dropdown); field-level relevantRiepr pointing at procedure_type is informational only

3. **Form State**
    - User selections are held as Lit reactive properties on CodelijstApp (selectedThemeId, selectedSubThemeId)
    - Multi-value fields (isMeervoudig) render repeated copies with add/remove buttons
    - No persistence — all state is ephemeral in-component or on the root app element

## Components

### codelijst-app (Root Component)

The main application component that:
- Loads and manages codelist data
- Provides global application state
- Coordinates between child components
- Displays status information

### codelijst-theme-selector

A reusable component for theme selection that:
- Reads available themes from the codelist
- Renders a dropdown with theme labels
- Shows sub-themes when a theme has narrower children
-Emits events for theme selection changes

## Codelist Structure

The RIE-IEPR codelist is organized as:

```
conceptscheme:               # Root concept scheme
├── thema-type               # Themes (water, lucht, grondwater, etc.)
│   ├── conceptscheme:operationeel-water
│   ├── conceptscheme:operationeel-lucht
│   └── ...
├── operationeel-<domain>    # Operational schemas per domain
│   ├── <property-group>
│   │   ├── property-1       # With relevantDataType, relevantCodeList
│   │   └── property-2
│   └── ...
└── <other-schemes>          # E.g., emissiepunt-type, filter-type, etc.
```

## Integration with @domg-wc/components (vl-*)

The app uses `@domg-wc/components` v2.16.0 from a private Artifactory registry configured in `.npmrc`. Registration happens via side-effect imports in `src/main.ts`:

```ts
import '@domg-wc/components/atom'
import '@domg-wc/components/form'
import '@domg-wc/components/block'
```

Design tokens come from `@domg-wc/styles` raw CSS files imported in `src/styles/main.css`. No custom component CSS is written — all styling comes from the design system's shadow-DOM styles and token variables. The API reference for available components, properties, events, and slots lives in `node_modules/@domg-wc/components/<package>/**/*.component.d.ts`.

## Building and Running

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linting
npm run lint
```

## Testing Strategy

- **Playwright** - E2E tests for key user flows (`tests/codelijst.spec.ts`)
- **Vitest** - Unit tests for services
- **Manual testing** - HTML validation and browser compatibility

## Configuration Files

- `tsconfig.json` - TypeScript compilation settings
- `vite.config.js` - Vite build and dev server configuration
- `package.json` - Project metadata and scripts
- `.editorconfig` - Code formatting consistency

## Known Issues

See `docs/ISSUES.md` for tracked issues in the codelist data.
