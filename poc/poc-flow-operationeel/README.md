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

## Architecture Overview

See `docs/architecture.md` for detailed architecture documentation.
