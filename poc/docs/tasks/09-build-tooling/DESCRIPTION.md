# Epic 09: Automated Codelist Sync

## AS IS

- The canonical codelist source lives at `src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld` (repo root, Java/Maven resource, **outside** `./poc`).
- The POC reads its copy from `poc/public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld` via `CodelistService` (`baseUrl` + `fileName` in `poc/src/services/codelist-service.ts`), served by Vite as a static asset.
- Today this copy was made manually and happens to be byte-identical to the source, but nothing keeps it that way. If the upstream Java resource changes, the POC will silently keep serving a stale codelist.
- Reported in `poc/docs/FEEDBACK.md` (2026-07-27): "The latest code list jsonld should be automatically copied if this is not already the case."

## TO BE

### Goals

Ensure the POC always runs against the latest codelist without a human remembering to copy the file, while respecting the guardrail that only `./poc` may be modified (the source file outside `poc` must only be *read*, never written).

### In Scope

- Add a small Node script under `poc/` (e.g. `poc/scripts/sync-codelist.mjs` or similar) that:
  - Reads `../src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld` relative to the `poc` directory.
  - Copies it to `poc/public/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld`, creating parent directories if needed.
  - Skips the copy (no-op, no error) only if the source file cannot be found — degrade gracefully like the rest of this codebase (see `ISSUES.md`), don't crash `npm run dev`/`build`.
  - Logs what it did (copied / already up to date / source missing) to stdout.
- Wire it into `poc/package.json` so it runs automatically:
  - `predev` / `prebuild` npm lifecycle scripts (or equivalent) that invoke the sync script before `vite`/`tsc && vite build`.
- Keep the change confined to `./poc` — only read access to the sibling `src/main/resources/...` path is needed, no writes outside `./poc`.
- Update `poc/AGENTS.md` and/or `poc/docs/ARCHITECTURE.md` to document the sync step and where the two copies of the file live.
- Add/update an entry in `poc/docs/ISSUES.md` noting the previous manual-copy gap and how it's resolved (follow the existing issue template).

### Out of Scope

- Changing anything under `src/main/resources/` (read-only reference).
- Watching the file for live-reload while `vite dev` is running (a one-shot sync at the start of `dev`/`build` is sufficient for a POC).
- Any diffing/versioning of the codelist content itself.

## DOD (Definition of Done)

- [ ] Sync script exists under `poc/` and copies the latest `rie-iepr.jsonld` from the root Java resource path into `poc/public/...`.
- [ ] Running `npm run dev` or `npm run build` from `poc/` automatically performs the sync with no manual step.
- [ ] If the source file is temporarily unavailable, the script logs a warning and the existing `poc/public/...` copy is left untouched (build doesn't fail).
- [ ] No files outside `./poc` are created or modified.
- [ ] `poc/AGENTS.md` or `poc/docs/ARCHITECTURE.md` documents the sync mechanism.
- [ ] `poc/docs/ISSUES.md` records the gap and its resolution.
- [ ] `npm run build` and `npm run dev` still work end to end after the change.
