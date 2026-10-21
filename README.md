# codelijst-rie-iepr

Codelijsten voor het RIE-IEPR-project (Richtlijn Industriële Emissies / Industrial Emissions Portal Regulation) van het Departement Omgeving, Vlaanderen.

De codelijsten zijn gemodelleerd als [SKOS](https://www.w3.org/TR/skos-reference/) conceptschema's en worden gegenereerd vanuit een CSV-bronbestand. Ze worden gepubliceerd op [data.omgeving.vlaanderen.be](https://data.omgeving.vlaanderen.be).

## Inhoud

De volgende conceptschema's zijn opgenomen:

| Conceptschema | Beschrijving |
|---|---|
| `emissiepunt_eigenschappen` | Koppeling tussen soorten emissiepunten en hun eigenschappen |
| `installatie_eigenschappen` | Koppeling tussen soorten installaties en hun eigenschappen |
| `filter_eigenschappen` | Koppeling tussen soorten filters en hun eigenschappen |
| `installatie_type` | Soorten installaties (GPBV, IEPR, Stookinstallatie, ...) |
| `emissiepunt_type` | Soorten emissiepunten (schouw, fakkel, lozingspunt, ...) |
| `onttrekkingspunt_type` | Soorten onttrekkingspunten (Grondwaterput, ...) |
| `filter_type` | Soorten filters (Peilfilter, ...) |
| `meetinstrument_type` | Soorten meetinstrumenten (Debietmeter, ...) |
| `meetpunt_type` | Soorten meetpunten (meetput, controle-inrichting, ...) |
| `procedure_type` | Soorten procedures in een procesplan |
| `procesvariabele_type` | Types stoffen bij bepaalde procedure-types |
| `rubriek_type` | Typering van rubrieken (VLAREM, EGW) |
| `data_type` | Soorten data types |
| `status_type` | Soorten statussen |

## Uitvoerformaten

De codelijsten worden gegenereerd in de volgende formaten:

- Turtle (`.ttl`)
- JSON-LD (`.jsonld`)
- N-Triples (`.nt`)
- JSON (`.json`)
- CSV (`.csv`)
- Parquet (`.parquet`)
- Excel (`.xlsx`)

## Projectstructuur

```
src/
├── source/
│   ├── codelijst-source.csv   # Brondata
│   ├── config.yml             # Configuratie (paden, prefixen, metadata)
│   └── context.json           # JSON-LD context
├── main/resources/be/vlaanderen/omgeving/
│   └── ...                    # Gegenereerde output en AP-constraints
├── 01_codelijst_skos_from_csv.js  # Genereert SKOS-bestanden vanuit CSV
├── 02_metadata.js                  # Genereert DCAT-metadata
└── 99_deploy_latest.js             # Publiceert naar Virtuoso triplestore
```

## Gebruik

### Vereisten

- Node.js
- Toegang tot `@milieuinfo/maven-metadata-generator-npm`

### Installatie

```bash
npm install
```

### Genereren van codelijsten

```bash
node src/01_codelijst_skos_from_csv.js
```

### Genereren van metadata

```bash
node src/02_metadata.js
```

### Publiceren naar de triplestore

```bash
node src/99_deploy_latest.js
```

## Configuratie

De configuratie staat in `src/source/config.yml`. Hierin worden onder andere de outputpaden, prefixen, DCAT-metadata en de Virtuoso-connectie ingesteld.

Verbindingsgegevens voor de Virtuoso-triplestore worden ingelezen vanuit een `.env`-bestand (niet ingecheckt in de repository).

### Codelijst-prefixen (CURIEs)

Concepten worden in de bron-CSVs aangeduid met een korte prefix gevolgd door de code,
bv. `installatie:stookinstallatie` of `installatie-eigenschappen:nominaal_thermisch_vermogen`.
De prefixen zijn bewust kort en herkenbaar gehouden: de naam van de codelijst zonder
technische voor- of achtervoegsels (`riepr-`, `-type`, `operationeel-`).

Nieuwe prefixen worden gedeclareerd bovenaan het `prefixes:`-blok in `src/source/config.yml`;
een prefix die in een CSV gebruikt wordt maar daar niet gedeclareerd is, laat `npm run generate_skos` falen.
De onderliggende URIs zijn ongewijzigd — enkel de korte naam verandert, dus gepubliceerde
identificatoren blijven geldig.

| Prefix | Codelijst (pad onder `.../id/concept/riepr/`) |
| --- | --- |
| `aangifte:` | `aangifte-type/` |
| `aangifte-status:` | `aangifte-status/` |
| `bandbreedte:` | `norm_bandbreedte/` |
| `bepalingsmethode:` | `operationeel-bepalingsmethode/` |
| `bepalingsmethodeclassificatie:` | `operationeel-bepalingsmethodeclassificatie/` |
| `bestemming:` | `operationeel-bestemmingstype/` |
| `contextueel:` | `operationeel-contextueel/` |
| `debiet:` | `operationeel-debiet-type/` |
| `emissie:` | `emissie-type/` |
| `emissiepunt:` | `emissiepunt-type/` |
| `emissiepunt-eigenschappen:` | `emissiepunt-eigenschappen/` |
| `emissiepunt-selectiemogelijkheden:` | `emissiepunt-eigenschappen-selectiemogelijkheden/` |
| `filter:` | `filter-type/` |
| `grondstoffen:` | `operationeel-grondstoffen/` |
| `grondwater:` | `operationeel-grondwater/` |
| `installatie:` | `installatie-type/` |
| `installatie-eigenschappen:` | `installatie-eigenschappen/` |
| `installatie-selectiemogelijkheden:` | `installatie-eigenschappen-selectiemogelijkheden/` |
| `lozingsplaats:` | `lozingspunt-lozingsplaats/` |
| `lucht:` | `operationeel-lucht/` |
| `meetfrequentie:` | `operationeel-meetfrequentie/` |
| `meetinstrument:` | `meetinstrument-type/` |
| `meetpunt:` | `meetpunt-type/` |
| `meetpunt-eigenschappen:` | `meetpunt-eigenschappen/` |
| `meetpunt-selectiemogelijkheden:` | `meetpunt-eigenschappen-selectiemogelijkheden/` |
| `onttrekkingspunt:` | `onttrekkingspunt-type/` |
| `onttrekkingspunt-eigenschappen:` | `onttrekkingspunt-eigenschappen/` |
| `peilmethode:` | `operationeel-peilmethode/` |
| `pomptoestand:` | `operationeel-pomptoestand/` |
| `procedure:` | `procedure-type/` |
| `procesvariabele:` | `procesvariabele-type/` |
| `rubriek:` | `rubriek-type/` |
| `status-type:` | `status-type/` |
| `techniekmonstername:` | `operationeel-techniekmonstername/` |
| `thema:` | `thema-type/` |
| `toepassingswijze:` | `operationeel-toepassingswijze/` |
| `toestand-indicator:` | `operationeel-toestand-indicator/` |
| `uitwisselpunt:` | `uitwisselpunt-type/` |
| `uitwisselpunt-eigenschappen:` | `uitwisselpunt-eigenschappen/` |
| `water:` | `operationeel-water/` |
| `zelfcontrole-lucht:` | `operationeel-zelfcontrole-lucht/` |
| `zelfcontrole-water:` | `operationeel-zelfcontrole-water/` |

> `status-type:` heet niet `status:` omdat `status` al een term is in `context.json` (`adms:status`).

## Interpretatie
Deze sectie bevat informatie over de interpretatie van de codelijsten.

### Structurele gegevens
Structurele gegevens zijn opgedeeld in meerdere CSV bestanden voor de verschillende structurele types in het datamodel. Met name, emissiepunten, installaties, filters, meetpunten, meetinstrumenten en uitwisselpunten. Elk van deze types heeft een eigen CSV-bestand voor de relevante eigenschappen die de vaste attributen van het datamodel aanvullen.

#### Types en eigenschappen
Elk systeem (`emissiepunt`, `filter`, `installatie`, `meetpunt`, `uitwisselpunt`, `onttrekkingspunt`) heeft twee codelijsten:
- `<systeem>_type.csv`: de soorten van dat systeem, als hiërarchie via `broader` (bv. `emissiepunt:schoorsteen` is een `emissiepunt:emissiepunt_lucht`). `isOnzichtbaar = true` verbergt een type voor selectie (bv. omdat het enkel een structurele groepering is); de subtypes blijven wel selecteerbaar en erven de eigenschappen. `isMeetbaar = true` geeft aan dat het systeemtype meetbaar is.
- `<systeem>_eigenschappen.csv`: de systeemeigenschappen die de vaste attributen uit het datamodel (`riepr.ttl`: naam, beschrijving, ...) aanvullen. De vaste attributen staan dus niet in de CSV's.

#### Welke eigenschappen gelden voor welk type?
`relevantRiepr` op een eigenschap bepaalt voor welke types ze geldt. De waarde bevat één of meer types, gescheiden door `|` of `,`.

1. **Direct**: de eigenschap geldt voor elk type dat in `relevantRiepr` staat.
2. **Overerving**: ze geldt ook voor alle subtypes van die types (`broader`-keten). Een eigenschap op `emissiepunt:emissiepunt_lucht` geldt dus ook voor `emissiepunt:schoorsteen`. Een eigenschap die enkel op een subtype staat, geldt niet voor het bovenliggende type.
3. **Alle types**: de waarde `conceptscheme:<systeem>_type` (bv. `conceptscheme:installatie_type`) betekent alle types van dat systeem.
4. **Leeg**: een eigenschap zonder `relevantRiepr` geldt voor **geen enkel type**. Dit is dus niet "alles". Enige uitzondering zijn onderdelen van een composite (zie hieronder).
5. **Onzichtbare types**: `isOnzichtbaar` beïnvloedt enkel of een type gekozen kan worden, niet welke eigenschappen het erft of doorgeeft.

##### Composite eigenschappen
Een composite eigenschap bestaat uit een ouder en onderdelen die naar de ouder verwijzen via `broaderPartitive`. De ouder heeft zelf geen waarde, de onderdelen vormen samen één invulbare groep.
- De ouder en onderdelen worden als één geheel getoond. Het type waarvoor de groep geldt, mag op de ouder, op de onderdelen of op beide staan; de scope van de groep is de unie van al die waarden. Een onderdeel zonder eigen `relevantRiepr` erft de scope van de groep en wordt nooit apart gefilterd.
- Voorbeelden uit de data:

| Composite | `relevantRiepr` op de ouder | `relevantRiepr` op de onderdelen |
|---|---|---|
| `installatie-eigenschappen:verwijderingsrendement` | leeg | `_stof`: `installatie:luchtzuivering`, `_percentage`: leeg |
| `meetpunt-eigenschappen:referentiepunt` | leeg | `_naam` en `_diepte`: `meetpunt:peilput` |

- Een composite waarvan noch de ouder, noch een onderdeel een `relevantRiepr` heeft, geldt voor geen enkel type en wordt als fout gerapporteerd.
- `isMeervoudig` op de ouder maakt de hele groep herhaalbaar: elke rij bevat alle onderdelen. Is de ouder ook `isVerplicht`, dan start de groep met één rij; anders is er enkel een knop om een rij toe te voegen.

##### Waardebepaling van een onderdeel
- `relevantDataType` bepaalt het type invoer (`xsd:decimal`, `xsd:integer`, ...). Zonder datatype en zonder lijst is het een vrije tekst.
- `relevantUnit` verwijst naar één CSOR-eenheid (`csor_eenheid:E_59`) of naar een `collectie:*` met meerdere eenheden waaruit gekozen wordt.
- `relevantCodeList` verwijst naar een lijst om uit te kiezen: een `conceptscheme:*` in dezelfde CSV (selectiemogelijkheden) of een `collectie:*` met CSOR-concepten (bv. stoffen). Labels en definities van CSOR-concepten komen uit de publieke lijsten [codelijst-csor-eenheid](https://github.com/milieuinfo/codelijst-csor-eenheid) en [codelijst-csor-variabele](https://github.com/milieuinfo/codelijst-csor-variabele).

> De MCP-server (`mcp/`) past exact deze regels toe in `get_type_properties`, `get_property` en `validate_codelists`.



### Operationele gegevens
Operationele gegevens beginnen vanaf de codelijst met de verschillende thematische stromen waarop met kan rapporteren. Deze sectie bevat voorbeelden van de verschillende stromen die aangeven hoe de relaties tussen de codelijsten tot stand komt. Het is gebaseerd op volgende algemene assumpties:
- `skos:ConceptScheme` voor elk scherm/stap dat we aan de gebruiker willen tonen
- `seeAlso` is een link tussen een concept en concept scheme en bepaald welke stap volgt
- `conditionPath`/`conditionValue` bepalen dat een concept getoond mag worden indien het concept op het pad (`conditionPath`) een bepaalde waarde (`conditionValue`) heeft
- `relevantDataType` bepaald het data type van een concept. `xsd:*` en `dcterms:*` zijn mogelijke data types
- `isPartOf` relaties (en de inverse `hasPart`) worden gebruikt om aan te geven dat een concept composite is en bestaat uit meerdere andere concepten die ingevuld moeten worden
- `related` (`skos:related`) geeft aan dat concepten alternatieve varianten zijn van één logische groep (bv. de vier `bestemmingsidentificatie-*` composieten voor een grondstof). Consumer applicaties tonen zo'n gerelateerde groep als één gegroepeerd veld: de velden van de varianten worden samengevoegd en gedupliceerde velden (bv. `naam`) worden slechts één keer getoond. Een gedeeld veld is enkel verplicht als álle varianten het verplicht maken; een veld dat in één variant voorkomt is verplicht telkens die variant actief is (`conditionPath`/`conditionValue`)
- `isMeervoudig` bepaald dat iets meerdere keren kan toegevoegd worden
    - een meervoudig concept dat ook verplicht is wordt standaard al 1 weergegeven (met composite concepten indien `hasPart` relatie bestaat), anders is het een knop om dit toe te voegen
- `isMultiselect` geeft aan (bij gebruikt `relevantCodeList` of `relevantRiepr` of `relevantUnit`) waarbij er een selectie gemaakt moet worden dat er meerdere items geselecteerd kunnen worden
- `isVerplicht` bepaald dat een veld verplicht is
- `isOnzichtbaar` is een kolom die momenteel niet in gebruik is voor operationele gegevens, het geeft aan dat een concept niet zichtbaar is (bijvoorbeeld als de opsplitsing gemaakt is voor structurele redenen)
- `isMeetbaar` geeft aan dat een systeemtype meetbaar is; voor de systeemtype-codelijsten wordt deze expliciet op `true` gezet
- `relevantCodeList` geeft aan dat in plaats van een vrij invoerveld, we een selectie willen tonen van een andere lijst. Dit zal steeds naar een `skos:ConceptScheme` verwijzen
- `relevantUnit` geeft aan dat een veld (hoogstwaarschijnlijk een numeriek veld) een bepaalde eenheid heeft. Het kan echter ook verwijzen naar een `skos:ConceptScheme` met lijst van eenheden zodat er een selectie gemaakt moet worden
- `relevantClass` geeft aan naar welke classe een concept gemapped moet worden. Bijvoorbeeld naar observatie, feature of interest, ...
    - De top-level operationele concepten (bv. `grondstof`, `brandstof`, `lozing`, `meting`) mappen op `sosa:ObservationCollection`: een observatieverzameling die de rapportage over een emissie- of onttrekkingsgebeurtenis in een periode of op een moment bundelt. De geneste rapportageconcepten daaronder mappen op `sosa:Observation` en worden als lid-observaties (`sosa:hasMember`) deel van die verzameling
- `relevantRiepr` geeft aan dat een selectie gemaakt moet worden van systemen/processen/... die actief waren in het productiejaar. In het geval dit start met `riepr:*` zoeken we op alle instanties van een concept (Installatie, Emisisepunt, ...). In het geval het start met een concept dan geven we aan dat het alle (sub)types zijn.
    - :warning: **Belangrijk:**

#### Thematische stroom
1.  In de applicatielogica voorzien we een selectie van het productiejaar. Dit zal de `sosa:phenonomenonTime` worden van de observaties die gerapporteerd zullen worden.
2.  De gebruiker selecteerd een thematische stroom waarop hij/zij will rapporteren. De lijst van thematische stromen halen we uit `conceptscheme:thema_type`. In de applicatie is dit de enige lijst die we in principe rechtstreeks moeten aanspreken, alle andere codelijsten worden vanuit de thematische stromen gerefereerd.
3.  Via de `seeAlso` relatie van de concepten binnen `conceptscheme:thema_type` kunnen we achterhalen welke concept schemas verantwoordelijk zijn voor de thematische stroom.

> De bedoeling is dat de applicatie zo weinig mogelijk logica omvat voor zowel UI als data ophalen/bewaren voor de thematische stromen. Zo kunnen a.h.v. deze codelijsten alle business regels worden bijgesteld waar nodig zonder al te grote wijzigingen te vereisen.

#### Contextueel
4.  De contextuele stroom `conceptscheme:operationeel_contextueel` vereist eerst dat je een GPBV installatie selecteerd (`relevantClass` = `sosa:FeatureOfInterest`)
5.  Vervolgens kan je hierop grondstoffen, energieverbruik, etc.. rapporteren
6.  Men kan na het selecteren van de GPBV installatie ook individueel rapporteren op de activiteiten van de GPBV installatie (`riepr:Rubriek`). We weten dat we rubrieken zoeken binnenin de GPBV installatie omdat ook hier `relevantClass` = `sosa:FeatureOfInterest` en we dus een genest feature of interest zoeken
7.  Rapportering op activiteit bevat bijvoorbeeld het productievolume

#### Grondstoffen
4.  De grondstoffen stroom `conceptscheme:operationeel_grondstoffen` vereist eerst dat je eenvinkt of je grondstoffen hebt geproduceerd (`grondstoffen:geproduceerd`)
5.  Het toevoegen/rapporteren van grondstoffen (`grondstoffen:grondstof`) is een meervoudige composite concept (via `hasPart`) dat enkel toont als `grondstoffen:geproduceerd` = `true` (a.h.v. `conditionPath`/`conditionValue`)
6.  Elementen die selecties uit een codelijst vereisen zoals toepassingswijze refereren naar een andere `skos:ConceptScheme`
7.  De bestemmingsidentificatie van een grondstof is één logische groep die bestaat uit vier gerelateerde varianten (`related`): Belgische vestiging, buitenlandse vestiging, geen onderneming en werf. Afhankelijk van de gekozen `grondstof_bestemming_type` toont de applicatie één "Bestemmingsidentificatie"-groep met de juiste velden (naam, ondernemings-/vestigingsnummer, BTW-nummer of adres)

#### Grondwater
4.  De stroom grondwater `conceptscheme:operationeel_grondwater` vereist eerst dat je specifieert welke meting je wil uitvoeren; kwaliteitsmeting, peilmeting of onttrekking/infiltratie. Dit zijn `skos:Concept`en die meervoudig zijn en via de `hasPart` relatie opgedeeld in de gevraagde gegevens
5.  Bijvoorbeeld. Peilmeting heeft een `relevantRiepr` met `filter:peil,filter:pomp`. In de JSON(-LD) zal dit als twee relaties komen te staan waardoor we dus zowel alle peil- en pompputten willen weergeven.

#### Lucht
4.  De stroom lucht `conceptscheme:operationeel_lucht` vereist als eerste stap dat je een emissiepunt (voor lucht) selecteerd
5.  Vervolgens moet je als multiselect bronnen selecteren (`riepr:Installatie`) verbonden met het emissiepunt. We weten dat we niet alle installaties zoeken omdat bij de selectie van het emissiepunt we als `relevantClass` = `sosa:FeatureOfInterest` hebben en dus binnen deze feature moeten zoeken
6.  Onderliggende rapportering zoals `lucht:brandstof` wordt op de bron+emissiepunt combinatie uitgevoerd en zijn composite concepten

## Licentie

[Modellicentie Gratis Hergebruik](http://data.vlaanderen.be/id/licentie/modellicentie-gratis-hergebruik/v1.0)

Uitgever: [Departement Omgeving](http://data.vlaanderen.be/id/organisatie/OVO003323)

## Links

- Dataset: [data.omgeving.vlaanderen.be](https://data.omgeving.vlaanderen.be/doc/catalog/codelijst.html)
- SPARQL-endpoint: [https://data.omgeving.vlaanderen.be/sparql](https://data.omgeving.vlaanderen.be/sparql)
- Broncode: [https://github.com/milieuinfo/codelijst-rie-iepr](https://github.com/milieuinfo/codelijst-rie-iepr)
