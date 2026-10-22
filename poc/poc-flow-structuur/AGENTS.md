# AGENTS.md — RIE-IEPR Structuur POC

## 1. Wat deze POC is

Een Nederlandstalige proof-of-concept die het **structuurformulier** toont: de gebruiker kiest een
systeemtype (emissiepunt, filter, installatie, meetpunt, uitwisselpunt of onttrekkingspunt) en ziet
daarna:

1. de **vaste velden** van dat systeem uit het RIE-IEPR datamodel (`riepr.ttl`);
2. alle **systeemeigenschappen** uit `<systeem>_eigenschappen.csv` die voor dat type gelden.

Er is geen backend en er wordt niets bewaard. De app draait naast `poc-flow-operationeel`
(operationele gegevens) en gebruikt dezelfde stack: Vite, Lit en `@domg-wc/components`/`@domg-wc/styles`.
De plannen staan in [`docs/plans/`](docs/plans/).

## 2. Datamodel en parsing

De browser parseert **niet** `riepr.ttl`. `scripts/sync-codelist.mjs` kopieert de gegenereerde
`rie-iepr.jsonld` uit de repo-root naar `public/resources/...`; `services/codelist-parse.ts` vlakt
dat document af tot één `Map<id, node>` en leidt daar `Concept`/`Scheme`-views van af (dezelfde
strategie als de operationele POC).

`riepr.ttl` wordt enkel door het bouwscript `scripts/build-systeemvelden.mjs` gelezen (met `n3`).

### Scoperegel (`relevantRiepr`)

Een eigenschap geldt voor een type als `relevantRiepr` dat type of een **voorouder** (`broader`)
bevat. Lege `relevantRiepr` betekent **niet** "alle types":

- een **composite** heeft geen eigen `relevantRiepr`; zijn scope is de **unie van de scopes van zijn
  kinderen**;
- een kind zonder eigen `relevantRiepr` **erft** de scope van de ouder en wordt nooit apart
  gefilterd.

Voorbeelden: `installatie-eigenschappen:verwijderingsrendement` geldt enkel voor
`installatie:luchtzuivering` (via het kind `..._stof`); `meetpunt-eigenschappen:referentiepunt` enkel
voor `meetpunt:peilput`. `src/services/dataconsistentie.test.ts` bewaakt dat elke composite een
scope heeft en dat geen zelfstandige eigenschap een lege `relevantRiepr` heeft.

### Zichtbare types

Een type met `isOnzichtbaar = true` verdwijnt uit de dropdown, maar zijn **zichtbare subtypes**
blijven staan (ze worden wortels van de zichtbare boom). Zijn eigenschappen worden via `broader` nog
steeds geërfd: `getAncestors()` wandelt de volledige keten, ook door onzichtbare types.

### Volgorde

Het gegenereerde JSON-LD sorteert alfabetisch. De redactionele volgorde staat in de CSV's;
`scripts/sync-codelist.mjs` schrijft die naar `src/generated/csv-volgorde.json` en
`structuur-service.ts` sorteert erop (velden, keuzelijsten en collectieleden).

## 3. Gegenereerde bestanden (niet met de hand aanpassen)

| Bestand | Script | Bron |
|---|---|---|
| `src/generated/csv-volgorde.json` | `scripts/sync-codelist.mjs` | `src/source/<systeem>_{type,eigenschappen}.csv` |
| `src/generated/systeemvelden.json` | `scripts/build-systeemvelden.mjs` | `riepr.ttl` (owl:Restriction) |
| `src/generated/csor.json` | `scripts/sync-csor.mjs` | GitHub `milieuinfo/codelijst-csor-{eenheid,variabele}` |
| `public/resources/.../rie-iepr.jsonld` | `scripts/sync-codelist.mjs` | `src/main/resources/.../rie-iepr.jsonld` |

- **CSOR altijd van GitHub.** `sync-csor.mjs` downloadt bij elke run
  `https://raw.githubusercontent.com/milieuinfo/codelijst-csor-eenheid` en
  `.../codelijst-csor-variabele`; een lokale checkout wordt nooit gebruikt. De download wordt in
  `.cache/csor/` bewaard als offline-fallback (`--offline` gebruikt enkel die cache).
  `npm run sync:csor` faalt luid zonder netwerk en cache; `predev`/`prebuild` gebruiken
  `--allow-stale` en houden dan de gecommitte `csor.json`.
- **Systeemvelden.** Wijzigt het datamodel, draai dan `npm run sync:velden` (of `pnpm build`). De
  uitsluitlijst en de Nederlandse labels staan met uitleg in `scripts/systeemvelden-config.mjs`.
- **Keuzelijst toevoegen.** Nieuwe CSOR-concepten in de eigenschappen-CSV's komen automatisch in
  `csor.json`; nieuwe inline lijsten (`conceptscheme:*`) komen uit het JSON-LD.

## 4. Componenten

Zie [`docs/COMPONENTS.md`](docs/COMPONENTS.md). Kernregels:

- Gebruik `@domg-wc/components`; eigen CSS alleen voor layout die de bibliotheek niet dekt.
- Geen labels dupliceren: een veld toont óf zijn eigen `vl-form-label` (enkelvoudig) óf de
  kolomhoofding van de composite-rij.
- Rijen hebben stabiele id's (`crypto.randomUUID()`) en worden met Lit `repeat` gerenderd, zodat
  verwijderen nooit de invoer van een andere rij verschuift.
- Meervoudig + verplicht start met één rij (niet verwijderbaar); meervoudig + optioneel start zonder
  rij (README-regel; MJV start altijd met één rij en wijkt hier bewust af).
- Waarden worden niet bewaard. Componenten sturen `structuur-waarde` (`{ pad, waarde }`) en
  `structuur-rijen` (`{ eigenschapId, rijIds }`); alleen het debugpaneel ("Toon waarden") gebruikt
  die om de huidige invoer als JSON te tonen.

## 5. Componentenbibliotheek

De `vl-*`-elementen worden geregistreerd door de side-effect imports in `src/main.ts`. De
API-referentie staat in `node_modules/@domg-wc/components/**/*.component.d.ts`. Let op:

- `vl-select-rich` is pas doorzoekbaar met het `search`-attribuut; zonder `not-deletable` kan de
  gebruiker een selectie wissen.
- **`vl-fieldset` verkleint de tekst.** In `@domg-wc/components` 2.16 adopteert `vl-fieldset` de
  form-label-styles met een `:host`-regel `font-size: 62.5%`; alles wat erin erft (o.a. de opties van
  een `vl-select-rich`) wordt daardoor 11,25px, en geneste fieldsets zelfs 7px. Elk component dat een
  `vl-fieldset` rendert, zet daarom `vl-fieldset { font-size: inherit }` in zijn `static styles`
  (zie `structuur-app` en `structuur-meervoudige-eigenschap`). Document-CSS bereikt de fieldset niet,
  want die zit in de shadow root.
- Klik in tests op `[part="vl-select-rich__combobox"]` voordat je typt; de native `select` is
  verborgen door Choices.js.
- `vl-button` gebruikt `label` als toegankelijke naam voor icoonknoppen.

## 6. Scope en grenzen

- Geen persistentie, geen backend, geen authenticatie; enkel Nederlandse labels.
- Geen validatie of opslag buiten HTML-constraints en de Nederlandse foutmeldingen.
- Extern gepubliceerde keuzelijsten (bv. `https://vito.be/codelijst/...`) worden niet opgelost; die
  velden vallen terug op vrije tekst met een aanduiding. Zie `docs/ISSUES.md`.
- Andere codelijsten (procedure, rubriek, status, aangifte, ...) vallen buiten deze POC.

## 7. Tests

- `pnpm test:unit` — services (scoperegel, types, selecties, CSOR), dataconsistentie op de echte
  CSV's/JSON-LD, en de componentdispatcher.
- `pnpm test` — Playwright-smoke per systeem, plus rij toevoegen/verwijderen bij
  `verwijderingsrendement` en de verplichte meervoudige `referentiepunt`.
- `pnpm lint` en `pnpm build` moeten groen zijn vóór een commit.

## 8. Deployment

De Jenkins-pipeline (`Jenkinsfile.groovy`, stage "Build POCs") bouwt `poc-landing`,
`poc-flow-operationeel` en deze POC en publiceert ze op GitHub Pages:

```
/                  ← poc-landing
/operationeel/     ← poc-flow-operationeel
/structuur/        ← deze POC
```

Alle drie gebruiken `base: './'` (relatieve assets) en `pnpm install --frozen-lockfile`. De
lockfiles zijn gecommitte; `src/generated/*` en `public/resources/*` moeten mee gecommitte zijn,
want de pipeline heeft geen sibling-checkout van `../RIE-IEPR` (het bouwscript houdt dan de
gecommitte `systeemvelden.json`).
