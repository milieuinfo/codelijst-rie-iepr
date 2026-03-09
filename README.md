# codelijst-rie-iepr

Codelijsten voor het RIE-IEPR-project (Richtlijn Industriële Emissies / Industriële Emissies Preventie en Reductie) van het Departement Omgeving, Vlaanderen.

De codelijsten zijn gemodelleerd als [SKOS](https://www.w3.org/TR/skos-reference/) conceptschema's en worden gegenereerd vanuit een CSV-bronbestand. Ze worden gepubliceerd op [data.omgeving.vlaanderen.be](https://data.omgeving.vlaanderen.be).

## Inhoud

De volgende conceptschema's zijn opgenomen:

| Conceptschema | Beschrijving |
|---|---|
| `emissiepunt_attributen` | Koppeling tussen soorten emissiepunten en hun attributen |
| `emissiepunt_type` | Soorten emissiepunten (schouw, fakkel, lozingspunt, ...) |
| `filter_type` | Types van filters (bv. peilfilter) |
| `filter_attributen` | Attributen van filters met eenheden |
| `installatie_type` | Types van installaties (GPBV, IEPR, oven, ...) |
| `installatie_eigenschappen_type` | Types voor installatie-eigenschappen |
| `meetinstrument_type` | Soorten meetinstrumenten (bv. debietmeter) |
| `meetpunt_type` | Soorten meetpunten (bv. meetput, controle-inrichting) |
| `onttrekkingspunt_type` | Soorten onttrekkingspunten (bv. grondwaterput) |
| `procedure_type` | Hoofdtyperingen van procedures in een procesplan |
| `procesvariabele_type` | Types stoffen bij bepaalde procedure-types |
| `rubriek_type` | Typering van rubrieken (VLAREM, EGW) |
| `datatypes` | Externe identificatoren |
| `vlarem-klasse` | VLAREM-indelingsklassen (klasse 1, 2, 3) |

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

## Licentie

[Modellicentie Gratis Hergebruik](http://data.vlaanderen.be/id/licentie/modellicentie-gratis-hergebruik/v1.0)

Uitgever: [Departement Omgeving](http://data.vlaanderen.be/id/organisatie/OVO003323)

## Links

- Dataset: [data.omgeving.vlaanderen.be](https://data.omgeving.vlaanderen.be/doc/catalog/codelijst.html)
- SPARQL-endpoint: [https://data.omgeving.vlaanderen.be/sparql](https://data.omgeving.vlaanderen.be/sparql)
- Broncode: [https://github.com/milieuinfo/codelijst-rie-iepr](https://github.com/milieuinfo/codelijst-rie-iepr)
