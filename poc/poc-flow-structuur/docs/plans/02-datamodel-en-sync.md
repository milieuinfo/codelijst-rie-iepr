# 02 — Datamodel en sync

## Doel
Eén gegenereerd, typed model dat plan 04–06 rechtstreeks gebruiken.

## Bronkeuze
Gebruik de **gegenereerde** `rie-iepr.jsonld`
(`src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/`) zoals de operationele
POC, zodat parsing hergebruikt wordt (`codelist-parse.ts`, `concept-query.ts`). `riepr.ttl` is een
ontwerpdocument en wordt **niet in de browser geparsed**; het bouwscript (taak 3) leest het.

## Scoperegel (`relevantRiepr`)
Een eigenschap geldt voor een type als `relevantRiepr` dat type of een voorouder (`broader`) bevat.
Lege `relevantRiepr` betekent **niet** "alle types", want in de data komt dit enkel voor bij
composites, waar het type op een kind staat:

| Eigenschap | `relevantRiepr` |
|---|---|
| `installatie-eigenschappen:verwijderingsrendement` (composite, meervoudig) | leeg |
| ↳ `..._stof` | `installatie:luchtzuivering` |
| ↳ `..._percentage` | leeg |
| `meetpunt-eigenschappen:referentiepunt` (composite, meervoudig, verplicht) | leeg |
| ↳ `..._naam`, `..._diepte` | `meetpunt:peilput` |

Volledige regel (gelijk aan de MCP-server, zie `README.md` van de repository, sectie
"Welke eigenschappen gelden voor welk type?"):
1. `relevantRiepr` is een lijst, gesplitst op `|` of `,`.
2. Een eigenschap geldt voor een type als de lijst dat type of een voorouder (`broader`) bevat.
3. De waarde `conceptscheme:<systeem>_type` betekent alle types van het systeem (komt in de huidige
   data niet voor, maar wordt door de MCP-server ondersteund en moet dus ook hier werken).
4. Leeg = geen enkel type, behalve bij composites: de scope van een composite is de unie van de
   `relevantRiepr` van de ouder en alle kinderen. Kinderen zonder eigen waarde erven die scope en
   worden nooit apart gefilterd.
5. Een composite zonder enige `relevantRiepr` (ouder en kinderen), of een standalone eigenschap
   zonder, geldt voor niets; de dataconsistentietest (plan 07) meldt dit.
6. `isOnzichtbaar` speelt hier geen rol: verborgen types geven eigenschappen nog steeds door aan
   hun subtypes.

## Taken
1. `scripts/sync-codelist.mjs`: kopieer `rie-iepr.jsonld` (pad `../..` vanaf de POC-root) naar
   `public/resources/...`. Zelfde "warn en exit 0"-gedrag als de operationele POC.
2. Hergebruik (kopie, later eventueel gedeelde package) van `models/` en
   `services/codelist-parse.ts`; verwijder wat enkel voor flows dient.
3. `scripts/build-systeemvelden.mjs` (zie plan 05): genereert `src/generated/systeemvelden.json`
   uit `riepr.ttl`.
4. `services/structuur-service.ts` met pure functies:
   - `getSystemen()` → de zes systemen met hun typeschema (`<systeem>_type`) en
     eigenschappenschema (`<systeem>_eigenschappen`).
   - `getTypes(systeem)` → alle concepten uit het typeschema, **zonder `isOnzichtbaar === true`**;
     houdt `broader` bij voor een boomweergave (ingesprongen labels).
   - `getAncestors(typeId)` → typeketen via `broader`.
   - `getEigenschappen(systeem, typeId)` → root-eigenschappen (zonder `broaderPartitive`) die voor
     het type gelden volgens de **scoperegel** hieronder; composite kinderen via `broaderPartitive`
     (zelfde `!field.broader`-regel als operationeel). Volgorde = CSV-volgorde.
   - `getSelectieOpties(codeListId)` → concepten van een inline `conceptscheme:*` (selectiemogelijkheden).
5. Normaliseer booleans (`"true"`/`true`), `isMeervoudig`, `isVerplicht`, `isOnzichtbaar`.
6. Leg de beslissingen uit `README.md` (zichtbare subtypes, scoperegel) vast in `AGENTS.md`.

## Tests (vitest)
- Onzichtbare types ontbreken; zichtbare kinderen van een onzichtbare ouder: conform de keuze.
- Eigenschap met `relevantRiepr: emissiepunt:emissiepunt_lucht` verschijnt bij `emissiepunt:schoorsteen`
  (subtype) maar niet bij `emissiepunt:lozingspunt`.
- Composite `installatie-eigenschappen:verwijderingsrendement` geeft 2 kinderen (stof, percentage)
  en verschijnt enkel bij `installatie:luchtzuivering`, niet bij `installatie:stookinstallatie`.
- `meetpunt-eigenschappen:referentiepunt` verschijnt enkel bij `meetpunt:peilput`.
- Subtype van een onzichtbaar type blijft in `getTypes` staan en erft de eigenschappen van de verborgen ouder.
- `relevantRiepr` met `|` en met `,` geeft hetzelfde resultaat; `conceptscheme:installatie_type` geldt voor alle installatietypes.
- **Pariteit met de MCP**: voor elk zichtbaar type en elk systeem is de lijst root-eigenschappen gelijk aan
  die van `getTypeProperties` in `mcp/src/query.ts` (importeer die functie in de test).
- Meerdere `relevantRiepr`-waarden worden als lijst behandeld.

## Klaar wanneer
Service-tests slagen voor alle zes systemen op de echte data.
