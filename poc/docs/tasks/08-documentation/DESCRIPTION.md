# Epic 08: Documentation & Knowledge Transfer

## AS IS

- PROJECT_OUTLINE.md exists at `poc/docs/PROJECT_OUTLINE.md`
- ISSUES.md exists but is empty (no known issues recorded yet)
- No architecture documentation, no developer guide, no component catalog

## TO BE

### Goals

Create comprehensive documentation that explains the codebase architecture, how to make changes, and how the codelist data flows through the application. This enables other agents and developers to work on the project independently.

### In Scope

- Create `AGENTS.md` at `poc/AGENTS.md` (repo root of the POC, the conventional location for this file - not under docs/):
  - High-level architecture overview with diagram description
  - Technology stack justification
  - Folder structure explanation
  - How JSON-LD codelist data flows from file → CodelistService → UI components
  - Step-by-step guide for adding a new user flow (theme + operationeel scheme)
  
- Create `ARCHITECTURE.md` at `poc/docs/ARCHITECTURE.md`:
  - Component tree showing relationships between <codelijst-app>, <codelijst-theme-selector>, <codelijst-operationeel-fields>
  - Data flow diagrams (text-based)
  - CodelistService API surface and usage examples

- Create `COMPONENTS.md` at `poc/docs/COMPONENTS.md`:
  - Catalog of all custom web components with properties, events, slots
  - Which vl-* components each uses internally
  - Usage examples in HTML/Lit template syntax
  
- Maintain documentation during development:
  - Each subagent working on a task must update relevant sections
  - New components added must be documented before DOD is marked complete
  - Any deviations from PROJECT_OUTLINE.md guardrails must be noted

### Out of Scope

- User-facing help documentation or tooltips within the app
- Marketing or project management documentation
- API documentation for non-existent backend endpoints
- Design system documentation (use flux-web-components official docs)

## DOD (Definition of Done)

- [x] AGENTS.md exists with architecture overview, tech stack, folder structure, and "adding new flows" guide
- [x] ARCHITECTURE.md documents component relationships and data flow
- [x] COMPONENTS.md catalogs all custom web components with props/events/slots
- [x] All three files are written in clear Dutch-friendly English (consistent with project language)
- [x] Documentation accurately reflects the actual codebase (no stale descriptions)
- [x] ISSUES.md has been updated throughout development with any codelist issues found
