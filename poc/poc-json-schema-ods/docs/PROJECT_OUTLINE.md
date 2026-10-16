## Description
This proof of concept uses the output of `poc-json-schema` (synced with `npm run predev`) to ODS sheets. Use appropriate libraries where needed.
A reference can be found in ./archive/lucht-template-valid-alles_ingevuld_met_kolommen_in_andere_volgorde.ods which is based on the lucht json schema from ./poc-json-schema

The ODT contains a readable label (text) and JSON LD reference line.

Any issues in the source data (json schemas) should be created in ISSUES.md similar to the other POC's. Try to also investigate if these issues arrise from the code lists themselves which are used to create the json schemas

Dropdown labels come from the codelist (`input/codelist.jsonld`). CSOR concepts (the stoffen of a `skos:Collection` such as `collectie:operationeel_stoffen_water`, and CSOR eenheden) are not part of the codelist: `npm run generate` looks up their `skos:prefLabel` and `csor:symbool` on the CSOR SPARQL endpoint (`CSOR_SPARQL_ENDPOINT`, default `https://data-ontwikkel.omgeving.vlaanderen.be/sparql`) and falls back to the URI fragment (`V_46`) when it is unreachable.
