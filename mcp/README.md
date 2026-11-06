# codelijst-rie-iepr MCP server

MCP server (TypeScript) om de RIE-IEPR codelijsten op te vragen en te beheren:

- de structurele codelijsten: systeemtypes en eigenschappen van `emissiepunt`, `filter`,
  `installatie`, `meetpunt`, `uitwisselpunt` en `onttrekkingspunt`, inclusief de inline
  selectielijsten die ze via `relevantCodeList` of `relevantUnit` gebruiken;
- de operationele gegevens: de thematische stromen (`thematypes.csv`), hun stappen en velden
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
`codelijst-opvragen`, `codelijst-systeemtype`, `codelijst-eigenschap`, `codelijst-wijzigen` en `codelijst-flows`.

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
| `list_flows` | Navigatiestromen en directe rapporteringsingangen; bereikbaarheid, (ongebruikte) optielijsten, bestanden die niet in `config.yml` staan |
| `get_flow` | Volledige flow van een thema als leesbare outline + UI-beschrijving per stap |
| `get_step` | Formulier van één stap: velden in weergavevolgorde, control, verplicht/meervoudig, opties, eenheden, bereik (`minValue`/`maxValue`), voorwaarden, varianten, volgende stap |
| `get_flow_item` | Record, UI-beschrijving en verwijzingen van een thema, stap, veld of optie |
| `validate_flows` | `vervolgstap`, rapporteringsingangen, voorwaarden, onderdelen, volgorde, `related`, codelijsten, placeholders (`http://TODO`) |
| `get_reporting_preview` | Actieve onderdelen compileren met de echte schema-/ODS-compilers; fouten per fase, werkboeken, afgevlakte kolommen, eenheden en koppelsleutels |
| `add_flow` | Nieuwe stroom: thema, `operationeel_<code>.csv` met eerste stap, `config.yml` en prefix |
| `add_step` | Stap toevoegen, gekoppeld via `vervolgstap` vanuit een veld |
| `add_field` | Veld of onderdeel toevoegen; komt standaard achteraan bij de broers/zussen |
| `update_flow_item` | Veld, stap(label) of thema aanpassen |
| `move_field` | Veld met alle onderdelen naar een andere stap/groep in hetzelfde CSV verplaatsen, zonder ids te wijzigen |
| `reorder_fields` | Volgorde van velden zetten (`_ui_first`/`_ui_after`) |
| `apply_operational_batch` | Samenhangende veld-/collectiewijzigingen voorbereiden en als één gevalideerde transactie uitvoeren |
| `delete_field`, `delete_step` | Verwijderen; volgorde en `related` worden bijgewerkt, `unlink` haalt `vervolgstap`-links weg |

`add_field` en `update_flow_item` ondersteunen `relevantObservation` (een lijst
van observaties/verzamelingen binnen dezelfde stap), `tableWorkbook`
(`_table_workbook`, een `.ods`-bestandsnaam zonder pad) en `tableSheet`
(`_table_sheet`, maximaal 31 tekens). Werkboek en werkblad worden samen
opgegeven of gewist. Tabelkolommen zijn presentatiemetadata, geen RDF-predicaten;
`relevantObservation` wordt wel als URI-verwijzing gepubliceerd.

De UI-beschrijving toont het bronmodel en de volgorde, niet de exacte afgevlakte
kolommen van de actuele schema-tabel. Singleton resultaten blijven in UI/ODS
inline; een bronstap is niet noodzakelijk één scherm of werkboek.

### Navigatie en rapporteringsingangen

`poc/reporting-entries.json` is de gedeelde declaratie voor de MCP-server en de
JSON Schema-snapshotgenerator: per ingang een bronbestand, `schemeId`, `slug`
en Nederlands `label`. De huidige ingangen zijn grondwater en lucht. Aanwezigheid
betekent dat het profiel de ingang moet compileren, niet dat die compilatie slaagt.
De declaratie is POC-configuratie, geen gepubliceerde codelijst of nieuwe RDF-relatie.

`list_flows` houdt `flows` voor themanavigatie en voegt `reportingEntries` toe,
met geldigheid en bereikbare stappen. `stepsNotReachableFromAThema` blijft de
navigatiestatus tonen; `reachableFromReportingEntry` maakt duidelijk of er wel
een directe rapporteringsingang bestaat. `get_flow` accepteert ook zo'n slug of
label; `get_step` vermeldt de bijbehorende `reportingEntry`.

`validate_flows` geeft geen onbereikbaarheidswaarschuwing voor geldige directe
ingangen of hun navigatievervolgstappen. Onjuiste bestand/schemaverwijzingen zijn
fouten; overige losse stappen blijven waarschuwingen. Zonder het optionele
manifest ondersteunt de MCP-server nog gewone themanavigatie; de snapshotgenerator
vereist een expliciete niet-lege declaratie en verzint geen ingangen op basis
van bestandsnamen. Ongeldige JSON, dubbele ingangen en onveilige namen worden geweigerd.
Er is nog geen MCP-schrijfhandeling om deze profielconfiguratie te wijzigen.

Deze snelle broncontrole vervangt geen strikte schemageneratie of ODS-roundtrip.
Na wijzigingen aan actieve onderdelen moeten de schema's en beide consumers
opnieuw worden gegenereerd/gesynchroniseerd, met controle van kolomvolgorde,
voorwaarden, eenheden en gedeelde demonstratiereferenties.

`get_reporting_preview({flow?, section?})` controleert alle gedeclareerde ingangen
of één ingang/onderdeel (bronconcept-ID of exact label). Het leest de huidige
CSV's met de gepubliceerde ondersteunende lijsten en gebruikt dezelfde compilers
als de POCs, zonder eigen domeinvalidatie. De uitvoer onderscheidt `schema`,
`tabular`, `template` en `ready`, met concrete fouten en controles per onderdeel.
Het lege sjabloon wordt enkel in geheugen aangemaakt. `populatedRoundTrip: false`
maakt expliciet dat ingevulde voorbeelden en volledige Teepak-dekking hiermee
niet gecertificeerd zijn. Snapshots en codelijsten worden niet geschreven.
De POC-dependencies moeten geïnstalleerd zijn; verouderde compileroutput wordt
bij de aanvraag herbouwd, ontbrekende packages worden niet automatisch geïnstalleerd.

Eenheden en andere CSOR-concepten krijgen waar beschikbaar labels en symbolen
uit dezelfde gepubliceerde-labelsnapshot als de UI
(`poc/poc-flow-operationeel/src/generated/csor.json`, gegenereerd met `sync:csor`).
Er wordt geen tweede CSOR-parser of netwerkopvraging toegevoegd. De bron-ID's
blijven behouden. Bij ontbrekende eenheidlabels geeft de veldbeschrijving een
expliciete melding; de preview vermeldt of de labelsnapshot beschikbaar was.

Alle schrijvende tools staan standaard op `dryRun: true` en tonen de regels die ze zouden
invoegen, wijzigen of verwijderen. Pas met `dryRun: false` wordt er geschreven.

Elke echte wijziging wordt gevalideerd met `npm run generate_skos` (in de root van de repository).
Faalt die, dan worden `src/source/`, `README.md`, de gegenereerde output en
`validation/validation_result.json` teruggezet naar de toestand van vóór de wijziging en geeft de
tool de fouten van de generator terug. Omdat de generator de vorige release ophaalt voor de
versionering, is netwerktoegang nodig om te kunnen schrijven.

`apply_operational_batch({operations, dryRun})` ondersteunt `add_field`,
`update_flow_item`, `move_field`, `reorder_fields` en `add_flow_collection`.
Elke operatie heeft `{tool, args}` zonder eigen `dryRun`. De bestaande controles
worden achtereenvolgens op een tijdelijke bronkopie uitgevoerd; volgende operaties
zien eerder toegevoegde velden en collecties. De root is contextgebonden, zonder
de procesomgeving te wijzigen. Een fout tijdens voorbereiding schrijft niets
naar de oorspronkelijke repository.

De dry-run toont per bestand alleen de uiteindelijke verwijderde en resulterende
CSV-regels. Na goedkeuring wordt de hele batch opnieuw voorbereid en eenmaal
geschreven, gevolgd door één `csv:fix` en één `generate_skos`. Elke validatiefout
of exception herstelt alle bronwijzigingen en gegenereerde uitvoer naar de toestand
vóór de batch, inclusief bestaande niet-gecommitte wijzigingen. Er zijn geen
verwijderoperaties of wijzigingen aan flow-/profielconfiguratie in deze batchtool.
Gevalideerde writes voor dezelfde repository worden binnen één serverproces
geserialiseerd, zodat een rollback geen andere gelijktijdige tool-write overschrijft.

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

- Codes in lowercase snake_case, ids `<systeem>:<code>` en `<systeem>eigenschappen:<code>`
- `prefLabel` begint met een hoofdletter, `definition` is verplicht (waarschuwing zonder eindpunt)
- Top concept (`topConceptOf`) óf `broader`/`broaderPartitive`, nooit beide; geen cycli
- Eigenschappen op topniveau hebben `relevantRiepr` naar types uit het eigen `_type.csv`
  (of `conceptscheme:<systeem>types` voor alle types)
- Een eigenschap heeft een `relevantDataType` óf een `relevantCodeList`; samengestelde
  eigenschappen geen van beide; `relevantUnit` enkel bij `xsd:decimal`/`xsd:integer`
- Alle CURIE-prefixen moeten gedeclareerd zijn in `config.yml`
- Meerdere waarden in één cel worden met `|` gescheiden

### Declaratieve operationele koppelingen

Operationele velden ondersteunen `referenceParent` en `referenceRelation`
als expliciete selectieafhankelijkheid, onafhankelijk van `vervolgstap`.
`tableKey` op een groep schrijft `_table_key`: concept-ID's van bestaande
onderdelen waarmee ODS detailrijen koppelt zonder een extra business-ID.
`add_field`/`update_flow_item` controleren verwijzingen en behouden de gewone
dry-run/goedkeuringscyclus. De verbindingen tussen echte systemen komen uit
referentiedata, niet uit de codelijst. Een sleutel legt geen ontologische
identiteit vast; de ODS-import weigert ontbrekende of dubbele combinaties.
De volgorde volgt de volledige `_ui_after`-keten, ook door conditionele velden
heen. Een conditioneel veld komt na zijn trigger, niet automatisch na alle
andere velden. Tegenstrijdige UI- en conditieafhankelijkheden zijn fouten.

`move_field({field, step, parent?, dryRun})` verplaatst de volledige
`broaderPartitive`-subboom. Zonder `parent` wordt het veld een topconcept van de
doelstap. De tool herstelt de volgordeketen op de oude plaats en voegt de groep
achteraan toe op de nieuwe plaats. Interne ids, selecties en metadata blijven
behouden; voorwaarden, observatieverwijzingen, sleutels en selectieafhankelijkheden
die door de verplaatsing ongeldig worden, blokkeren de wijziging. De tool herleidt
of verwijdert zulke verwijzingen niet automatisch. Verplaatsingen tussen
verschillende CSV-bestanden worden expliciet geweigerd. Gebruik eerst een dry
run en bevestig de getoonde regels voordat `dryRun: false` wordt gebruikt.

Na wijzigingen aan de servercode moet de MCP-client de stdio-server opnieuw
verbinden en de tooldefinities opnieuw ophalen. De launcher bouwt verouderde
TypeScript-output bij het starten, maar vervangt geen al draaiend serverproces.
Een verse verbinding biedt `tableKey`, `referenceParent` en `referenceRelation`
op `add_field`/`update_flow_item`, en de tool `move_field`. Onbekende
updatevelden worden geweigerd in plaats van stilzwijgend genegeerd.

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
| `src/flows-batch.ts` | Bestaande operationele bewerkingen isoleren, gezamenlijke eindpreview en atomair schrijven |
| `src/reporting.ts` | Read-only adapter naar de gedeelde schema-/ODS-preview |
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
