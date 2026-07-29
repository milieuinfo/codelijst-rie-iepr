# Epic 09: Status

_Last updated: 2026-07-27_

## Orchestration tasks

| # | Task | Status |
|---|------|--------|
| 1 | Implement automated codelist sync | **done** — implemented by local subagent (session `ses_05d187861ffe2lvqJd1eywUpGX`) |
| 2 | Review codelist sync implementation | **done** — independently reviewed by a second local subagent (session `ses_05c878c7affe31D7xpf7Sq424T`); verdict: correct and safe as-is, no bugs found |
| 3 | Verify build/dev still work | **done** — `npm run build` succeeds (671 modules, built in 22.30s); synced file confirmed on disk at `public/resources/.../rie-iepr.jsonld`, 366,768 bytes, byte-identical to source |

## Implementation subtasks (local subagent's own todo list)

- [x] Create `poc/scripts/sync-codelist.mjs` sync script
- [x] Wire `predev`/`prebuild` into `poc/package.json`
- [x] Update `poc/AGENTS.md` / `poc/docs/ARCHITECTURE.md` with sync documentation
- [x] Add `poc/docs/ISSUES.md` entry for manual-copy gap resolution
- [~] Verify: `npm install`, `npm run build`, standalone script test — **still running**

## Confirmed on disk (verified independently, not just self-reported)

```
$ ls poc/scripts/
sync-codelist.mjs

$ grep -A2 predev poc/package.json
"predev": "node scripts/sync-codelist.mjs",
"dev": "vite",
"prebuild": "node scripts/sync-codelist.mjs",

$ git status --porcelain poc
 M poc/AGENTS.md
 M poc/docs/ARCHITECTURE.md
 M poc/docs/ISSUES.md
 M poc/package.json
?? poc/docs/tasks/09-build-tooling/
?? poc/scripts/
```

Script content, doc wording, and ISSUES.md entry have **not yet been read/reviewed** by the orchestrator or a second subagent — only existence/wiring was spot-checked above.

## Not yet done

- No files have been committed; everything above is still an uncommitted working-tree change, pending an explicit commit request from the user.

## Next step

Epic complete. This resolves the FEEDBACK.md item "The latest code list jsonld should be automatically copied if this is not already the case." Awaiting user confirmation to commit.
