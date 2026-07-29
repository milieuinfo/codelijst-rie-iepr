There is an established project (poc-flow-operationeel) that creates a UI from the the codelists. This poc (poc-json-schema) has the goal to create/generate
a json-schema (or set of json-schemas) based on the code lists. It therefore shares quite a bit of logic from the other poc, but it should not reuse the code and should be standalone. Things like the sync of the codelists can be copied over.

./archive contains the json schemas that were created manually as a demonstration of what we want to achieve.

- observedProperty will direct to the codelist concept
- hasFeatureOfInterest will direct to the thing we are reporting on (controleinrichting, emissie, ..)
