# 05 — Systeemvelden uit het datamodel (`riepr.ttl`)

## Doel
De vaste velden van elk systeem tonen (naam, beschrijving, ...), afgeleid uit het datamodel
in plaats van hardcoded in de UI.

## Taken
1. `scripts/build-systeemvelden.mjs`: parse `riepr.ttl` met `n3`. Voor elk van de klassen
   `Installatie`, `Emissiepunt`, `Filter`, `Meetpunt`, `Uitwisselpunt`, `Onttrekkingspunt`
   lees de `owl:Restriction`-blokken onder `rdfs:subClassOf` en genereer
   `src/generated/systeemvelden.json`:
   ```json
   { "installatie": [ { "property": "rdfs:label", "label": "Naam", "verplicht": true,
       "meervoudig": false, "datatype": "xsd:string", "opmerking": "Een installatie moet een benaming hebben" } ] }
   ```
   - `verplicht` = `owl:minCardinality >= 1`; `meervoudig` = geen `owl:maxCardinality` of > 1;
   - `datatype` = `owl:someValuesFrom` (xsd:date → datepicker, xsd:dateTime, ...).
2. Uitsluiten (systeembeheerd, niet door de gebruiker in te vullen): `dct:created`, `dct:modified`,
   `dct:issued`/`dct:valid` (geldigheid), `adms:status`, `:aangifte`/`:ingediend`, `ssn:hasDeployment`,
   `ogc:hasGeometry`, `ssn:hasSubSystem` en inverse, `ssn:hasProperty` (die wordt apart gerenderd),
   `dct:type` (komt uit de dropdown). Houd de uitsluitlijst in één configuratiebestand
   met uitleg per regel zodat ze in review bijgesteld kan worden.
3. NL-labels via een kleine mapping `rdfs:label → "Naam"`, `rdfs:comment → "Beschrijving"`,
   `:inGebruikVanaf → "In gebruik vanaf"`, `:inGebruikTot → "In gebruik tot"`,
   `adms:identifier → "Externe identificatie"` (meervoudig); onbekende properties vallen terug op
   de `rdfs:comment` van de restrictie. Een test faalt als een niet-uitgesloten property geen label heeft.
4. Component `structuur-systeemvelden`: rendert de velden met `field-control-factory`
   (string → `vl-input-field`, `rdfs:comment` → tekstgebied, date → `vl-datepicker`,
   meervoudig → hergebruik de meervoudige rij uit plan 06).
5. Documenteer in de component en `AGENTS.md` dat deze velden uit `riepr.ttl` komen en
   bij wijziging van het datamodel het script opnieuw gedraaid moet worden (`predev`/`prebuild`).

## Tests
- `systeemvelden.json` bevat voor `installatie` minstens naam (verplicht), beschrijving
  (optioneel), in gebruik vanaf (verplicht).
- Gegenereerde uitvoer is deterministisch (twee runs → identieke file).

## Klaar wanneer
Per systeem verschijnen de juiste vaste velden met correcte verplicht/meervoudig-aanduiding.
