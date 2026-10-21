# 03 — CSOR-resolutie (eenheden en variabelen)

## Probleem
`relevantUnit` en `relevantCodeList` verwijzen naar CSOR-concepten (`csor_eenheid:E_*`,
`csor_variabele:V_*`), vaak via een `skos:Collection` (bv. `collectie:vermogen_eenheden`,
`collectie:verwijderingsrendement_stoffen`) waarvan de leden enkel een CURIE zijn. De huidige
operationele POC houdt een handmatige tabel bij (`csor-labels.ts`); die dekt maar een fractie.

## Aanpak
Een buildscript haalt de **publieke** GitHub-bestanden op en genereert enkel de benodigde subset,
zodat labels én definities overeenkomen met de gepubliceerde lijst:

| Lijst | Bron |
|---|---|
| Eenheden | `milieuinfo/codelijst-csor-eenheid` → `src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/csor/eenheid/eenheid.ttl` (270 kB) |
| Variabelen | `milieuinfo/codelijst-csor-variabele` → `.../csor/variabele/variabele.ttl` (1,5 MB) |

## Taken
1. `scripts/sync-csor.mjs`:
   - verzamel alle `csor_eenheid:*` en `csor_variabele:*` die in de eigenschappen-CSV's voorkomen
     (rechtstreeks in `relevantUnit` of als lid van een `collectie:*`);
   - download de `.ttl` via `https://raw.githubusercontent.com/milieuinfo/<repo>/main/<pad>`
     (lokale checkout `../codelijst-csor-variabele` als fallback, en cache in `.cache/csor/`);
   - parse de turtle met `n3` (devDependency) en extraheer per concept `skos:prefLabel` (nl),
     `skos:definition`, `skos:notation`, `csor:symbool` (eenheden), `owl:deprecated`;
   - schrijf `src/generated/csor.json` (`{ "csor_eenheid:E_1": { label, definition, symbol } }`).
   Een offline run zonder netwerk én zonder cache faalt luid, met uitzondering van `--allow-stale`.
2. `services/csor.ts`: `resolveConcept(curie)`, `resolveUnit(curie)` (symbool, anders label),
   `resolveCollection(collectieId)` → geordende leden met label en definitie (alfabetisch op label).
   Onbekende id: toon de lokale naam en log één waarschuwing, geen crash.
3. Verwijder de afhankelijkheid van een handmatige tabel; `csor-labels.ts` wordt niet meegenomen.
4. Eenheden:
   - één eenheid → vaste suffix (`vl-text`) naast het veld;
   - collectie of scheme met meerdere eenheden → `vl-select-rich` zonder lege keuze, eerste als standaard
     (zoals MJV `#renderEenheidSelector`);
   - `title`/tooltip toont de definitie.
5. `relevantCodeList`:
   - `conceptscheme:*` (inline lijst, bv. `lozingspunt_lozingsplaats`) → opties uit de CSV;
   - `collectie:*` (CSOR-stoffen) → leden uit `csor.json`, label + definitie, doorzoekbaar
     (de variabelenlijst is groot; `vl-select-rich` met zoekfunctie);
   - `isMultiselect` → meerdere waarden toegestaan.
6. Documenteer in `AGENTS.md` hoe `csor.json` ververst wordt en dat het gegenereerd is.

## Tests
- `csor_eenheid:E_43` → label "procent", symbool "%", definitie niet leeg.
- `collectie:verwijderingsrendement_stoffen` → exact de leden `V_2217` en `V_1096` met CSOR-labels.
- Alle CURIEs uit de eigenschappen-CSV's resolven (test faalt bij onbekende id).

## Klaar wanneer
Geen enkele eenheid of stof in de UI toont een ruwe CURIE; labels komen exact overeen met de bron.
