# POC Project - RIE-IEPR Codelist Web UI

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Preview

```bash
npm run preview
```

## Linting

```bash
npm run lint
npm run lint:fix
```

## Deployment

The Jenkins pipeline builds this POC together with `poc-flow-structuur` and `poc-landing` and
publishes them on GitHub Pages:

```
/                  ← poc-landing
/operationeel/     ← this POC
/structuur/        ← poc-flow-structuur
```

The Vite build uses `base: './'`, so the assets load relatively and the build works both on GitHub
Pages (`https://milieuinfo.github.io/codelijst-rie-iepr/`) and behind any other subpath. The local
dev server keeps running at `/`.

## Data synchronisation

`pnpm dev` and `pnpm build` first run two sync scripts:

- `scripts/sync-codelist.mjs` — copies the generated `rie-iepr.jsonld` into `public/resources/...`.
- `scripts/sync-csor.mjs` — downloads the CSOR lists the operationele fields refer to (eenheden,
  variabelen, kwantificeerbare aspecten, dragers en soorten waardebepaling) from GitHub and writes
  `src/generated/csor.json` with their labels, definitions and unit symbols.

CSOR is always fetched from the published GitHub repositories; a download is cached in `.cache/csor/`
as an offline fallback. Run `pnpm sync:csor` to refresh manually. The generated file is committed,
so a build without network still works (`--allow-stale`).

## Architecture Overview

See `docs/architecture.md` for detailed architecture documentation.
