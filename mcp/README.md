# codelijst-rie-iepr MCP server

MCP server (TypeScript) om de RIE-IEPR codelijsten op te vragen en te beheren:

- de structurele codelijsten: systeemtypes en eigenschappen van `emissiepunt`, `filter`,
  `installatie`, `meetpunt`, `uitwisselpunt` en `onttrekkingspunt`, inclusief de inline
  selectielijsten die ze via `relevantCodeList` of `relevantUnit` gebruiken;
- de operationele gegevens: de thematische stromen (`thema_type.csv`), hun stappen en velden
  (`operationeel_*.csv`) en het formulier (UI) dat eruit volgt.

Andere codelijsten (procedure, rubriek, status, aangifte, ...) vallen buiten scope.

De server schrijft enkel in `src/source/` (de betrokken CSV's, `config.yml` voor nieuwe prefixen
en bestanden) en in de prefixtabel van `README.md`.
Enkel de betrokken regels worden ingevoegd, vervangen of verwijderd, zodat de git-diff minimaal
blijft. Bij het toevoegen van een kolom (`collections`, `isMultiselect`) krijgt elke regel een
extra komma.

## Installatie

```bash
cd mcp
npm install    # installeert en bouwt naar mcp/dist/ (publieke npm registry, zie mcp/.npmrc)
```

Agents starten de server via `node mcp/bin/codelijst-mcp.js`. Dat startscript (zonder
dependencies) voert bij de eerste start `npm ci` uit en bouwt opnieuw wanneer `mcp/src/` nieuwer
is dan `mcp/dist/`; alle npm-uitvoer gaat naar stderr zodat stdout vrij blijft voor MCP. De
server is geregistreerd voor opencode, Codex, Gemini CLI, Cursor, VS Code, GitHub Copilot CLI en
Claude Code; de configuratiebestanden staan opgesomd in `AGENTS.md`. De bijhorende skills staan in `.agents/skills/`:
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

### Operationele flows

| Tool | Doel |
|---|---|
| `list_flows` | Thematische stromen met hun stappen; onbereikbare stappen, (ongebruikte) optielijsten, bestanden die niet in `config.yml` staan |
| `get_flow` | Volledige flow van een thema als leesbare outline + UI-beschrijving per stap |
| `get_step` | Formulier van één stap: velden in weergavevolgorde, control, verplicht/meervoudig, opties, eenheden, voorwaarden, varianten, volgende stap |
| `get_flow_item` | Record, UI-beschrijving en verwijzingen van een thema, stap, veld of optie |
| `validate_flows` | seeAlso, voorwaarden, onderdelen, volgorde, `related`, codelijsten, placeholders (`http://TODO`) |
| `add_flow` | Nieuwe stroom: thema, `operationeel_<code>.csv` met eerste stap, `config.yml` en prefix |
| `add_step` | Stap toevoegen, gekoppeld via `seeAlso` vanuit een veld |
| `add_field` | Veld of onderdeel toevoegen; komt standaard achteraan bij de broers/zussen |
| `update_flow_item` | Veld, stap(label) of thema aanpassen |
| `reorder_fields` | Volgorde van velden zetten (`_ui_first`/`_ui_after`) |
| `delete_field`, `delete_step` | Verwijderen; volgorde en `related` worden bijgewerkt, `unlink` haalt `seeAlso`-links weg |

De UI-beschrijving volgt de interpretatie van `poc/poc-flow-operationeel` (volgorde volgens
`ui-sort.ts`, controls zoals `field-control-factory.ts`).

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
| `src/flows.ts` | Operationele flows lezen: stappen, UI-volgorde en -beschrijving, validatie |
| `src/flows-edit.ts` | Flows, stappen en velden toevoegen, aanpassen, herschikken en verwijderen |
| `src/references.ts` | Verwijzingen zoeken en hulpfuncties voor aanpassen/verwijderen |
| `src/rules.ts` | Gedeelde conventies en controles |
| `src/validate.ts` | `validate_codelists` |
| `src/pipeline.ts` | `npm run generate_skos` uitvoeren en terugzetten bij fouten |
| `src/csv.ts`, `src/repo.ts` | Regelbehoudend CSV-bewerken, paden en prefixen |
| `bin/codelijst-mcp.js` | Startscript voor agents: installeert en bouwt indien nodig |

```bash
cd mcp
npm run build      # tsc → dist/
npm test           # typecheck (src + test), build en vitest
```

De tests werken op een tijdelijke kopie van de repository (via `CODELIJST_ROOT`); de
pipeline-tests voeren daar de echte `npm run generate_skos` uit.
