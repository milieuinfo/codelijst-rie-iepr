# Epic 05: Documentation Maintenance

## AS IS

- AGENTS.md, docs/ARCHITECTURE.md, and docs/ISSUES.md exist as project documentation.
- AGENTS.md and ARCHITECTURE.md were written/updated in a prior task to reflect the real `@domg-wc/components` integration and the generic `CodelistService` parsing strategy.
- No process exists to keep these documents in sync when future tasks introduce architectural changes — they can easily become stale.

## TO BE

### Goals

Establish a simple but enforceable rule: whenever any future task modifies the architecture (new components, new services, new conceptscheme handling, new vl-* usage patterns), the relevant documentation files must be updated in the same change, not left behind. This keeps the codebase self-documenting without introducing auto-generated doc pipelines that add build complexity.

### In Scope

- **AGENTS.md** (`poc/AGENTS.md`) — update when:
  - New web component types are introduced beyond `<codelijst-theme-selector>` and `<codelijst-operationeel-fields>`.
  - The `CodelistService` gains new resolution logic or parses additional SKOS properties.
  - New `vl-*` web-component usage patterns emerge (e.g. new form control types not currently covered).
  - The npm/.npmrc registry configuration or side-effect import pattern in `src/main.ts` changes.
  - Any section of AGENTS.md becomes inaccurate due to refactoring (e.g. file paths, component names, service method signatures).

- **docs/ARCHITECTURE.md** — update when:
  - New top-level directories or structural files are added.
  - The data flow between components/services changes (e.g. new events, new reactive property contracts).
  - A new conceptscheme type is supported with different rendering logic than the current thema/sub-thema → operationeel fields path.
  - The mock-data layer (`mock-data.service.ts`) grows new integration points.

- **docs/ISSUES.md** — update whenever:
  - A new codelist data-quality gap is discovered during implementation (e.g. missing `prefLabel`, unresolvable `relevantCodeList` references, malformed SKOS narrower/broader chains, TODO placeholders left by data authors).
  - An existing issue in ISSUES.md is resolved and no longer applies.
  - Workarounds are introduced in code for known data gaps — document both the workaround location and the underlying data problem so future maintainers understand why.

### Out of Scope

- Auto-generated API documentation / JSDoc-to-HTML pipeline — this is a POC; plain Markdown kept manually in sync is sufficient.
- Documentation style guides or formatting rules beyond matching the existing heading structure and level of detail seen in AGENTS.md and prior task DESCRIPTION.md files.
- Translating documentation to languages other than Dutch and English.

## DOD (Definition of Done)

- [ ] AGENTS.md reflects current component names, file paths, service methods, and vl-* usage patterns at the time of each architectural change
- [ ] docs/ARCHITECTURE.md accurately describes the directory structure, data flow, and supported conceptscheme types as implemented
- [ ] docs/ISSUES.md lists all known codelist data-quality gaps with their locations and any code workarounds applied
- [ ] No "(planned)" or aspirational language remains in documentation for items that have already been implemented
- [ ] Every task PR or commit that touches architecture includes corresponding documentation updates in the same change
