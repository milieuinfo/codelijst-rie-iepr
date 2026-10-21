# Structuur POC — RIE-IEPR

Proof of concept van het formulier voor **structurele gegevens** (systemen): kies een systeemtype en
krijg de vaste velden uit het RIE-IEPR datamodel plus alle systeemeigenschappen van dat type.

De app is Nederlandstalig, heeft geen backend, bewaart niets en gebruikt de
`@domg-wc/components` webcomponenten van de Vlaamse overheid.

## Snel starten

```bash
pnpm install
pnpm dev        # http://localhost:3001/codelijst-rie-iepr-poc-structuur/
pnpm test:unit  # vitest
pnpm test       # playwright
pnpm lint
pnpm build
```

`predev` en `prebuild` synchroniseren automatisch de codelijst, de CSOR-labels en de systeemvelden.

## Deployment

De Jenkins-pipeline bouwt deze POC samen met `poc-flow-operationeel` en `poc-landing` en publiceert
ze op GitHub Pages:

```
/                  ← poc-landing
/operationeel/     ← poc-flow-operationeel
/structuur/        ← deze POC
```

De Vite-build gebruikt `base: './'`, zodat de assets relatief laden en dezelfde build zowel op GitHub
Pages (`https://milieuinfo.github.io/codelijst-rie-iepr/`) als achter een ander subpad werkt. De
lokale dev-server blijft op `/` draaien.

## Documentatie

- [`docs/plans/`](docs/plans/) — de plannen (01–07) die deze POC implementeert, met de bronkeuzes en
  de scoperegel.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — dataflow en belangrijkste bestanden.
- [`docs/COMPONENTS.md`](docs/COMPONENTS.md) — de componenten en hun events.
- [`docs/ISSUES.md`](docs/ISSUES.md) — bevindingen in de bronbestanden voor het datateam.
- [`AGENTS.md`](AGENTS.md) — werkinstructies voor agents.

Deze POC is de tegenhanger van [`../poc-flow-operationeel`](../poc-flow-operationeel) (operationele
gegevens) en volgt dezelfde stack en conventies.
