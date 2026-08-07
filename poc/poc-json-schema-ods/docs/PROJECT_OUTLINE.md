## Description
This proof of concept uses the output of `poc-json-schema` (synced with `npm run predev`) to ODS sheets. Use appropriate libraries where needed.
A reference can be found in ./archive/lucht-template-valid-alles_ingevuld_met_kolommen_in_andere_volgorde.ods which is based on the lucht json schema from ./poc-json-schema

The ODT contains a readable label (text) and JSON LD reference line.

Any issues in the source data (json schemas) should be created in ISSUES.md similar to the other POC's. Try to also investigate if these issues arrise from the code lists themselves which are used to create the json schemas
