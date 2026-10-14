# AGENTS.md — codelijst-rie-iepr

SKOS code lists for RIE-IEPR (Departement Omgeving, Vlaanderen), generated from the CSV files in
`src/source/` and published on data.omgeving.vlaanderen.be. See `README.md` for how the lists are
interpreted (relevantRiepr, relevantCodeList, composites, ...). Labels and definitions are Dutch.

## Layout

- `src/source/*.csv` — the source of truth, listed in `src/source/config.yml` (`source.codelijst_csv`)
- `src/source/config.yml` — prefixes (CURIEs used in the CSVs must be declared here) and metadata
- `src/source/context.json` — JSON-LD context mapping CSV columns to properties
- `src/main/resources/...` — generated output, never edit by hand
- `mcp/` — MCP server (TypeScript) for querying and managing the systeemtype and eigenschappen code lists
- `.agents/skills/` — task instructions (SKILL.md format) for agents

## Commands

Run from the repository root:

```bash
npm run csv:check       # column counts of all source CSVs (npm run csv:fix pads missing columns)
npm run generate_skos   # generate all output formats and run SHACL validation (needs network)
cd mcp && npm install   # install and build the MCP server (to mcp/dist/)
cd mcp && npm test      # typecheck, build and test the MCP server
```

## Systeemtypes and eigenschappen

For `emissiepunt`, `filter`, `installatie`, `meetpunt`, `uitwisselpunt` and `onttrekkingspunt`:

- Answering **questions** ("Welke typen installaties bestaan er?", "Wat zijn de eigenschappen van een
  fakkel?"): follow `.agents/skills/codelijst-opvragen/SKILL.md`.
- Adding a **type** (`src/source/<systeem>_type.csv`): follow `.agents/skills/codelijst-systeemtype/SKILL.md`.
- Adding an **eigenschap** (`src/source/<systeem>_eigenschappen.csv`), including selections,
  units and composite properties: follow `.agents/skills/codelijst-eigenschap/SKILL.md`.
- **Editing or deleting** types, eigenschappen, inline selection lists or their options: follow
  `.agents/skills/codelijst-wijzigen/SKILL.md`.

Use the tools of the `codelijst-rie-iepr` MCP server for these changes instead of editing the CSVs by
hand; they enforce the conventions and keep diffs minimal. If its tools are not available, do not
fall back to editing the CSVs: tell the user the server is not connected (see below).

The server is started with `node mcp/bin/codelijst-mcp.js` from the repository root. That launcher
installs and builds `mcp/` on first start (and rebuilds after changes to `mcp/src/`), so no manual
`npm install` is needed. It is registered for these agents:

| Agent | MCP config | Note |
|---|---|---|
| opencode | `opencode.json` | |
| Codex | `.codex/config.toml` | Loaded only after trusting the project; start Codex from the repo root |
| Gemini CLI | `.gemini/settings.json` | Also makes Gemini read this `AGENTS.md`; start from the repo root |
| Cursor | `.cursor/mcp.json` | |
| VS Code (Copilot Chat) | `.vscode/mcp.json` | |
| GitHub Copilot CLI, Claude Code | `.mcp.json` | |

Any other agent: register a stdio server with command `node` and args
`["<repo>/mcp/bin/codelijst-mcp.js"]`. Skills in `.agents/skills/` are discovered by opencode, Codex,
Gemini CLI, Cursor, VS Code and Copilot CLI.

The operationele gegevens (thematische stromen in `thema_type.csv`, their steps and fields in
`operationeel_*.csv`, and the form they produce): follow `.agents/skills/codelijst-flows/SKILL.md`.

Other code lists (procedure, rubriek, status, aangifte, ...) are not covered by the server or skills.

## Rules

- Every change to `src/source/` must be validated with `npm run generate_skos`; a change is only done
  when it passes. The MCP write tools do this automatically and roll the change back on failure;
  after a manual edit, run it yourself (or the `generate_skos` MCP tool). Commit the regenerated
  output together with the source change.
- Identifiers are published URIs: never rename them. Deleting a concept is allowed (it is published as
  `adms:status Withdrawn`), but only after showing the user what is removed and getting confirmation.
- Write changes as a dry run first and show the user the resulting CSV lines before writing.
- When a property needs a selection list, ask the user whether it is an already published list or a
  new list in the same CSV; do not guess.
