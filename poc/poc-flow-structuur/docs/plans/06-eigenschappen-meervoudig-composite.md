# 06 — Systeemeigenschappen, meervoudig en composite

## Doel
Alle systeemeigenschappen van het gekozen type renderen, inclusief `isMeervoudig` en composites.
Gedrag volgt MJV (`mjv-eigenschap-veld`, `mjv-eenvoudige-eigenschap`, `mjv-meervoudige-eigenschap`,
`mjv-eigenschap-input`, `eigenschap-eenheid.util`) en de interpretatieregels uit de README van de
repository.

## Gedrag (afgeleid van MJV)
| Geval | Weergave |
|---|---|
| Enkelvoudig, niet composite | Eén invoer: label (`(*)` indien verplicht), waarde, eenheid |
| Meervoudig, niet composite | Fieldset met titel; rij per waarde + knop "<label> toevoegen"; rij verwijderen met knop |
| Composite (heeft `broaderPartitive`-kinderen), enkelvoudig | Fieldset met kinderen naast elkaar |
| Composite + meervoudig | Fieldset met kolomhoofdingen (labels kinderen), per rij alle kinderen naast elkaar, rij toevoegen/verwijderen. Kolombreedte = `floor((12 − 1) / aantalKinderen)`, 1 kolom voor de actieknop |
| Meervoudig + verplicht | Start met 1 rij; de verwijderknop van de enige rij is uitgeschakeld |
| Meervoudig + niet verplicht | Start zonder rij, enkel de toevoegknop (README-regel; MJV start altijd met 1 rij en wijkt hier bewust af) |

## Taken
1. `components/structuur-eigenschap.ts` (dispatcher): kiest enkelvoudig / meervoudig / composite
   op basis van het model uit plan 02.
2. `components/structuur-eigenschap-input.ts`: één veld.
   - `relevantDataType` → control via `field-control-factory`: `xsd:decimal`/`xsd:integer` met
     regex en Nederlandse melding (komma als decimaalteken, zoals MJV), `xsd:boolean` → checkbox,
     datum → datepicker, anders tekst;
   - `relevantCodeList` → `vl-select-rich` (plan 03; `isMultiselect` ondersteund);
   - `relevantUnit` → suffix of selector (plan 03), veldnaam-conventie `<key>__waarde`/`<key>__eenheid`;
   - `relevantRiepr` met `riepr:parameter`/`relevantProperty`: informatief, geen extra control.
3. `components/structuur-meervoudige-eigenschap.ts`: rijbeheer met stabiele rij-id's
   (`crypto.randomUUID()`), `repeat` met sleutel zodat verwijderen geen invoer van andere rijen
   verschuift (zie `rijIds`/`rijWaarden` in MJV).
4. Composite met een kind dat zelf een lijst is (bv. `verwijderingsrendement_stof` met
   collectie van stoffen): per rij een stof-selector + percentage.
5. Voorbeelden die handmatig én in de tests gedekt moeten zijn:
   - `installatie:luchtzuivering` → `verwijderingsrendement` (composite, meervoudig, stof uit
     CSOR-collectie + percentage met `csor_eenheid:E_43`);
   - `emissiepunt:schoorsteen` → hoogte/diameter met eenheid meter (`E_59`);
   - `emissiepunt:lozingspunt` → lozingsplaats (inline keuzelijst);
   - een eigenschap met meerdere eenheden uit een collectie (bv. vermogen).
6. Toegankelijkheid: label bij elk veld, `aria-label` op rij-knoppen
   ("<label> rij verwijderen"), volgorde = CSV-volgorde.
7. Geen validatie of opslag buiten HTML-constraints; "Toon waarden" (debug-paneel) toont de huidige
   invoer als JSON ter controle van de structuur (composite → geneste `deeleigenschappen`).

## Tests
- Unit: dispatcher kiest de juiste variant voor de vier gevallen.
- Playwright: rij toevoegen/verwijderen bij `verwijderingsrendement`; waarden van overblijvende
  rijen blijven behouden; verplichte meervoudige eigenschap start met 1 rij en kan niet naar 0.
- Playwright: wissel van type verwijdert alle eigenschappen van het vorige type.

## Klaar wanneer
Alle zes systemen tonen hun eigenschappen zonder console-fouten; de voorbeelden in taak 5 werken.
