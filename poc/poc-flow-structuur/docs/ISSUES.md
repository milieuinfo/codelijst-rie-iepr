# Bevindingen in de bronbestanden — voor het datateam

Deze POC omzeilt geen bronfouten. Waar de data of de gepubliceerde CSOR-lijsten iets niet bevatten,
valt de UI terug op een veilige weergave en staat de bevinding hier. De automatische controle staat in
`src/services/dataconsistentie.test.ts` (groen op de huidige data).

## 1. CSOR-eenheden en -variabelen hebben geen `skos:definition`

`codelijst-csor-eenheid` en `codelijst-csor-variabele` publiceren `skos:prefLabel`, `skos:notation`,
`csor:symbool` en `owl:deprecated`, maar **geen** `skos:definition`. Plan 03 verwachtte een niet-lege
definitie; de tooltip naast een eenheid toont daardoor enkel het label.

- Impact: geen; de UI toont label/symbool.
- Gewenst: definities toevoegen aan beide CSOR-lijsten (of een definitie per eenheid in de
  RIE-IEPR-codelijst).

## 2. `rdfs:comment` is enkel voor `Installatie` gedeclareerd

`riepr.ttl` bevat een `rdfs:comment`-restrictie voor `:Installatie`, maar niet voor `:Emissiepunt`,
`:Filter`, `:Meetpunt`, `:Uitwisselpunt` en `:Onttrekkingspunt`. Plan 05/07 verwachtten een
beschrijvingsveld per systeem.

- Impact: enkel een installatie krijgt een "Beschrijving"-veld; de andere systemen niet.
- Gewenst: dezelfde restrictie toevoegen aan de vijf andere klassen (of bewust documenteren waarom
  die er niet is).

## 3. `rdfs:label` en `rdfs:comment` hebben geen `owl:maxCardinality`

Het datamodel laat de maximumcardinaliteit weg (een label mag meertalig zijn). De generieke regel
"geen maxCardinality ⇒ meervoudig" zou daarom "Naam toevoegen"-rijen opleveren.

- Oplossing in de POC: `scripts/systeemvelden-config.mjs` bevat een `ENKELVOUDIG`-override met
  uitleg; die is zichtbaar in review.
- Gewenst: `owl:maxCardinality 1` per taal, of een expliciete notitie in het datamodel.

## 4. Extern gepubliceerde keuzelijsten zijn niet oplosbaar in deze POC

Drie eigenschappen verwijzen naar een lijst die niet in `rie-iepr.jsonld` of CSOR zit:

| Eigenschap | `relevantCodeList` |
|---|---|
| `filter-eigenschappen:watervoerendeLaag` | `https://data.bodemenondergrond.vlaanderen.be/id/conceptscheme/aquiferhcovv2` |
| `installatie-eigenschappen:luchtzuiverings_techniek` | `https://vito.be/codelijst/luchtzuiveringstechniek` |
| `installatie-eigenschappen:waterzuiveringstechniek_techniek` | `https://vito.be/codelijst/waterzuiveringstechniek` |

- Impact: de UI toont een tekstveld met de melding dat de lijst extern gepubliceerd is.
- Gewenst: publiceren als SKOS-lijst zodat de labels en definities opgehaald kunnen worden (zoals
  voor CSOR), of de lijst inline in de codelijst opnemen.

## 5. Lange ketens van onzichtbare types

`emissiepunt:emissiepunt_lucht` én `emissiepunt:schoorsteen` zijn onzichtbaar; enkel
`schoorsteen_verticale_uitstroom` en `schoorsteen_horizontale_uitstroom` blijven zichtbaar. Ook
`filter:filter` en `installatie:gpbv` zijn onzichtbaar. De zichtbare subtypes worden daardoor wortels
in de dropdown en erven via `broader` nog steeds de eigenschappen van hun verborgen ouders.

- Impact: geen fout, maar de "Schoorsteen"-groep valt weg uit de dropdown; gebruikers kiezen meteen
  de uitstroomvariant.
- Te beoordelen: is `emissiepunt:schoorsteen` bewust onzichtbaar?

## 6. `waterzuiveringstechniek` leunt op geërfde scope

De composite `installatie-eigenschappen:waterzuiveringstechniek` heeft zelf
`relevantRiepr = installatie:waterzuivering`, maar **geen enkel kind** heeft een eigen
`relevantRiepr`. Dat werkt dank zij de erfenisregel (kinderen erven de scope van de ouder), maar wijkt
af van de andere composites, waar minstens één kind de scope draagt.

- Impact: geen.
- Gewenst: de scope expliciet op de kinderen zetten, voor consistentie.

## 7. Geen CI-pipeline in de zuster-POC

Plan 07 vermeldt "dezelfde stappen als `poc-flow-operationeel` (indien daar een pipeline voor
bestaat)". Die pipeline bestaat niet in deze repository (geen `.gitlab-ci.yml` of vergelijkbaar), dus
er is geen CI toegevoegd. De stappen staan in `AGENTS.md` en `README.md`:

```bash
pnpm lint && pnpm build && pnpm test:unit && pnpm test
```

## 8. Kleinigheden

- `csor_eenheid:E_41` heeft als symbool `ton` (niet `t`), zoals gepubliceerd. Overgenomen zonder
  correctie.
- De collectie `collectie:vermogen_eenheden` bevat één eenheid (`E_92`, MW), waardoor het veld een
  vaste suffix toont in plaats van een selector. Dat is het bedoelde gedrag.
- `:inGebruikVanaf` en `:inGebruikTot` zijn in het datamodel datums (`xsd:date`); de UI gebruikt
  daarvoor `vl-datepicker`.
