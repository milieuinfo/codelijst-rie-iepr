# POC-landingspagina — RIE-IEPR

Startpagina voor de twee proofs of concept:

- [Operationele gegevens](../poc-flow-operationeel) — thematische stromen met hun stappen en velden.
- [Structurele gegevens](../poc-flow-structuur) — systeemtypes met vaste velden en eigenschappen.

De pagina gebruikt dezelfde Vite/Lit-stack en dezelfde Vlaamse design tokens als de POC's.

## Lokaal

```bash
pnpm install
pnpm dev     # http://localhost:3002/
```

De links verwijzen in development naar de dev-servers van de POC's
(`http://localhost:3000/` en `http://localhost:3001/`).

## Deployment

De Jenkins-pipeline bouwt de drie projecten en publiceert ze op GitHub Pages:

```
/                            ← deze landingspagina
/operationeel/               ← poc-flow-operationeel
/structuur/                  ← poc-flow-structuur
```

Alle drie de builds gebruiken `base: './'`, zodat de assets relatief laden en dezelfde build zowel
op GitHub Pages (`https://milieuinfo.github.io/codelijst-rie-iepr/`) als achter een ander subpad
werkt.
