# 04 — Typeselector

## Doel
Eén dropdown met alle zichtbare types van de zes systemen.

## Taken
1. Component `structuur-type-selector` (`<vl-select-rich>`, doorzoekbaar):
   - opties gegroepeerd per systeem (Emissiepunt, Filter, Installatie, Meetpunt, Uitwisselpunt,
     Onttrekkingspunt); label = `prefLabel`, tooltip = `definition`;
   - subtypes ingesprongen onder hun `broader` (diepte uit `getTypes`);
   - nooit `isOnzichtbaar === true`; geen scheme- of collectie-concepten.
2. Event `type-select` met `{ systeem, typeId }`; leegmaken van de selectie reset het formulier.
3. `structuur-app` houdt `selectedTypeId` bij en toont hieronder het formulier (plan 05 + 06).
4. Toon bij selectie een kleine samenvatting: systeem, definitie, `isMeetbaar` indien waar.

## Tests
- Aantal opties = som van zichtbare types per systeem (afgeleid uit de CSV's in de test).
- Een bekend onzichtbaar type komt niet voor.
- Selectie triggert `type-select` met de juiste systeemsleutel.

## Klaar wanneer
Alle zichtbare types selecteerbaar; wissel van type vervangt het formulier volledig.
