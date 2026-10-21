# 01 — Scaffolding

## Doel
Een lege maar buildbare POC `poc/poc-flow-structuur` met dezelfde tooling als `poc-flow-operationeel`.

## Taken
1. Kopieer configuratie uit `poc-flow-operationeel`: `.editorconfig`, `.eslintrc.cjs`, `.gitignore`,
   `.npmrc`, `tsconfig.json`, `vite.config.js`, `vitest.config.ts`, `playwright.config.ts`,
   `index.html`, `src/styles/main.css`.
2. `package.json`: naam `codelijst-rie-iepr-poc-structuur`, zelfde scripts en dependencies
   (`@domg-wc/components`/`styles` 2.16.0, `@domg/govflanders-style`, `lit`). Vite `base` en
   dev-poort aanpassen (bv. 3001) zodat beide POC's naast elkaar draaien.
3. `src/main.ts`: enkel de nodig `vl-*` imports (select-rich, input-field, checkbox, datepicker,
   fieldset, form-label, button, alert, text).
4. Mappen `src/{components,models,services,styles}`, `tests/`, `scripts/`.
5. `AGENTS.md`: korte versie van die van `poc-flow-operationeel` (secties: wat de POC is,
   parsing, componentenbibliotheek, sync, scope). `README.md` verwijst naar `docs/plans/`.
6. `pnpm install` (private Artifactory, zie `.npmrc`) en `pnpm build` slagen met een
   placeholder `<structuur-app>`.

## Niet doen
Geen code kopiëren die we niet gebruiken (thema-selector, flow-stack, structural-refs).

## Klaar wanneer
`pnpm dev` toont een lege pagina met titel; `pnpm lint` en `pnpm build` slagen.
