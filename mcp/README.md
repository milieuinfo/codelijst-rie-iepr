# codelijst-rie-iepr MCP server

MCP server (TypeScript) om systeemtypes en eigenschappen van de structurele codelijsten op te
vragen en te beheren (`emissiepunt`, `filter`, `installatie`, `meetpunt`, `uitwisselpunt`,
`onttrekkingspunt`), inclusief de inline selectielijsten die ze via `relevantCodeList` of
`relevantUnit` gebruiken. Andere codelijsten (operationeel, thema, ...) vallen buiten scope.

De server schrijft enkel in `src/source/`: `<systeem>_type.csv`, `<systeem>_eigenschappen.csv`
en, wanneer een nieuwe prefix nodig is, `config.yml` en de prefixtabel in `README.md`.
Enkel de betrokken regels worden ingevoegd, vervangen of verwijderd, zodat de git-diff minimaal
blijft. Bij het toevoegen van een kolom (`collections`, `isMultiselect`) krijgt elke regel een
extra komma.

## Installatie

```bash
cd mcp
npm install    # installeert en bouwt naar mcp/dist/ (publieke npm registry, zie mcp/.npmrc)
```

Registreer de server in je agent of editor als stdio-server met `node mcp/dist/index.js` vanuit
de root van de repository (zie `AGENTS.md`). De bijhorende skills staan in `.agents/skills/`:
`codelijst-opvragen`, `codelijst-systeemtype`, `codelijst-eigenschap` en `codelijst-wijzigen`.

## Tools

### Opvragen

| Tool | Doel |
|---|---|
| `list_types` | Types van een systeem ("Welke typen installaties bestaan er?") |
| `list_properties` | Eigenschappen, samengestelde eigenschappen en inline selectielijsten van een systeem |
| `get_type_properties` | Alle eigenschappen van een type, ook geërfd van een breder type of gemeenschappelijk voor alle types ("Wat zijn de eigenschappen van een fakkel?") |
| `get_property` | Details van een eigenschap: datatype, eenheid, selectieopties, onderdelen en de types waarop ze van toepassing is |
| `search_codelists` | Vrij zoeken (hoofdletter- en accentongevoelig) in types, eigenschappen en selectieopties |
| `find_code_lists` | Bestaande codelijsten zoeken (repo, extern gerefereerd, optioneel SPARQL-endpoint) |
| `validate_codelists` | Snelle controle: kolommen, dubbele ids, referenties, prefixen, ontbrekende datatypes |
| `generate_skos` | `npm run generate_skos` uitvoeren, bv. na een manuele wijziging |

### Wijzigen

| | Toevoegen | Aanpassen | Verwijderen |
|---|---|---|---|
| Type | `add_type` | `update_type` | `delete_type` |
| Eigenschap | `add_property` | `update_property` | `delete_property` |
| Inline selectielijst | `add_selection_list` (`extend: true` voegt opties/leden toe) | `update_selection_list` (lijst en opties) | `remove_list_entries`, `delete_selection_list` |

Alle schrijvende tools staan standaard op `dryRun: true` en tonen de regels die ze zouden
invoegen, wijzigen of verwijderen. Pas met `dryRun: false` wordt er geschreven.

Elke echte wijziging wordt gevalideerd met `npm run generate_skos` (in de root van de repository).
Faalt die, dan worden `src/source/`, `README.md`, de gegenereerde output en
`validation/validation_result.json` teruggezet naar de toestand van vóór de wijziging en geeft de
tool de fouten van de generator terug. Omdat de generator de vorige release ophaalt voor de
versionering, is netwerktoegang nodig om te kunnen schrijven.

### Aanpassen en verwijderen

- Codes (en dus URI's) kunnen niet hernoemd worden. Een aangepast concept krijgt bij publicatie
  `dct:modified` en `dct:isVersionOf`; een verwijderd concept wordt gepubliceerd met
  `adms:status Withdrawn`.
- Bij een aanpassing wijzigen enkel de velden in `set`; `null` maakt een veld leeg. Regels die al
  vóór de aanpassing een regel overtraden (bv. geen definitie) blokkeren de aanpassing niet; dat
  wordt als waarschuwing gemeld.
- Verwijderen wordt geweigerd zolang een andere regel in een van de bron-CSV's naar het concept
  verwijst; de fout somt die regels op. `delete_type` kan met `removeFromProperties` het type uit
  `relevantRiepr` van eigenschappen halen, `delete_property` verwijdert een samengestelde eigenschap
  met haar onderdelen en met `deleteUnusedLists` ook inline lijsten die niet meer gebruikt worden.

Bij een eigenschap met `codeList` moet `codeListSource` aangeven of het om een reeds
gepubliceerde lijst gaat (`published`) of om een lijst in hetzelfde CSV (`inline`). Ontbreekt
die keuze, dan vraagt de server het aan de gebruiker via MCP-elicitation als de client dat
ondersteunt, en anders weigert de tool met de vraag om het na te vragen.

## Conventies die afgedwongen worden

- Codes in lowercase snake_case, ids `<systeem>:<code>` en `<systeem>-eigenschappen:<code>`
- `prefLabel` begint met een hoofdletter, `definition` is verplicht (waarschuwing zonder eindpunt)
- Top concept (`topConceptOf`) óf `broader`/`broaderPartitive`, nooit beide; geen cycli
- Eigenschappen op topniveau hebben `relevantRiepr` naar types uit het eigen `_type.csv`
  (of `conceptscheme:<systeem>_type` voor alle types)
- Een eigenschap heeft een `relevantDataType` óf een `relevantCodeList`; samengestelde
  eigenschappen geen van beide; `relevantUnit` enkel bij `xsd:decimal`/`xsd:integer`
- Alle CURIE-prefixen moeten gedeclareerd zijn in `config.yml`
- Meerdere waarden in één cel worden met `|` gescheiden

## Ontwikkeling

| Bestand | Inhoud |
|---|---|
| `src/index.ts` | MCP-server en tooldefinities (zod-schema's) |
| `src/systeemtypes.ts` | Types: oplijsten, toevoegen, aanpassen, verwijderen |
| `src/eigenschappen.ts` | Eigenschappen: oplijsten, toevoegen, aanpassen, verwijderen |
| `src/lists.ts` | Inline selectielijsten en het zoeken naar bestaande codelijsten |
| `src/query.ts` | Vragen over types en eigenschappen (overerving, zoeken) |
| `src/references.ts` | Verwijzingen zoeken en hulpfuncties voor aanpassen/verwijderen |
| `src/rules.ts` | Gedeelde conventies en controles |
| `src/validate.ts` | `validate_codelists` |
| `src/pipeline.ts` | `npm run generate_skos` uitvoeren en terugzetten bij fouten |
| `src/csv.ts`, `src/repo.ts` | Regelbehoudend CSV-bewerken, paden en prefixen |

```bash
cd mcp
npm run build      # tsc → dist/
npm test           # typecheck (src + test), build en vitest
```

De tests werken op een tijdelijke kopie van de repository (via `CODELIJST_ROOT`); de
pipeline-tests voeren daar de echte `npm run generate_skos` uit.
