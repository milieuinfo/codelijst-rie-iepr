# Plannen — poc-flow-structuur

POC die een formulier toont voor **structurele gegevens** (systemen): de gebruiker kiest een
systeemtype in een dropdown, waarna de standaardvelden uit het datamodel en alle
systeemeigenschappen van dat type verschijnen. Het is de tegenhanger van
[`../../../poc-flow-operationeel`](../../../poc-flow-operationeel) (operationele gegevens) en volgt
dezelfde stack en conventies (Vite, Lit, `@domg-wc/*`, geen backend, geen persistentie, Nederlands).

## Doel

1. Dropdown met alle types uit `emissiepunt_type`, `filter_type`, `installatie_type`,
   `meetpunt_type`, `uitwisselpunt_type`, `onttrekkingspunt_type`, behalve concepten met
   `isOnzichtbaar = true`.
2. Na selectie: de **standaardvelden** van het systeem uit `riepr.ttl` (naam/`rdfs:label`,
   beschrijving/`rdfs:comment`, in gebruik vanaf/tot, ...) en alle **systeemeigenschappen** uit
   `<systeem>_eigenschappen.csv` waarvan `relevantRiepr` naar het gekozen type (of een
   supertype) verwijst.
3. Correcte weergave van `isMeervoudig` en composite eigenschappen (`broaderPartitive`),
   geïnspireerd op MJV (`mjv-meervoudige-eigenschap`, `mjv-eigenschap-input`).
4. Eenheden (`relevantUnit`) en selecties (`relevantCodeList`) met labels en definities uit de
   publieke CSOR-codelijsten (`codelijst-csor-eenheid`, `codelijst-csor-variabele`).

## Plannen (in uitvoeringsvolgorde)

| # | Plan | Resultaat |
|---|---|---|
| 01 | [Scaffolding](01-scaffolding.md) | Projectskelet, scripts, AGENTS.md, README |
| 02 | [Datamodel en sync](02-datamodel-en-sync.md) | Types, eigenschappen en riepr-velden als typed model |
| 03 | [CSOR-resolutie](03-csor-resolutie.md) | Labels/definities van eenheden en variabelen uit GitHub |
| 04 | [Typeselector](04-type-selector.md) | Dropdown zonder onzichtbare types |
| 05 | [Systeemvelden](05-systeemvelden.md) | Standaardvelden uit `riepr.ttl` |
| 06 | [Eigenschappen, meervoudig, composite](06-eigenschappen-meervoudig-composite.md) | Eigenschapsformulier |
| 07 | [Tests en kwaliteit](07-tests-en-kwaliteit.md) | Unit- en Playwright-tests, lint, build |

## Afhankelijkheden tussen plannen

`01 → 02 → (03, 04, 05 parallel) → 06 → 07`. Plan 06 vereist 02, 03 en 04.

## Bronnen

| Bron | Pad / URL |
|---|---|
| Types | `src/source/<systeem>_type.csv` (kolommen `broader`, `isOnzichtbaar`, `isMeetbaar`) |
| Eigenschappen | `src/source/<systeem>_eigenschappen.csv` (`relevantRiepr`, `broaderPartitive`, `isMeervoudig`, `isVerplicht`, `relevantDataType`, `relevantUnit`, `relevantCodeList`) |
| Datamodel | `../RIE-IEPR/src/main/resources/be/vlaanderen/omgeving/riepr/data/ns/riepr/riepr.ttl` |
| MJV-referentie | `../mjv/mjv-webapp/src/loket/exploitaties/detail/onderdeel/eigenschap/` |
| CSOR eenheden | https://github.com/milieuinfo/codelijst-csor-eenheid (`.../csor/eenheid/eenheid.ttl`) |
| CSOR variabelen | https://github.com/milieuinfo/codelijst-csor-variabele (`.../csor/variabele/variabele.ttl`) |

## Beslissingen

- **Verborgen ouder, zichtbare kinderen**: subtypes van een type met `isOnzichtbaar = true` blijven
  zichtbaar. Enkel het concept zelf verdwijnt uit de dropdown; zijn eigenschappen blijven geërfd.
- **Eigenschappen zonder `relevantRiepr`**: in de huidige data komt dit enkel voor bij composite
  onderdelen (zie plan 02, "Scoperegel"). Leeg betekent **geen enkel type** (niet "alle types");
  "alle types" is expliciet `conceptscheme:<systeem>_type`. De POC volgt hierin de MCP-server en
  de sectie "Welke eigenschappen gelden voor welk type?" in de root-`README.md`.
- **Locatie**: de POC staat onder `poc/poc-flow-structuur` (naast `poc-flow-operationeel`), niet in
  de repo-root.
