# Feedback POC 2026-08-04

1. The output of "lucht" schema has the following data:
```
    "featureEp": {
      "title": "Emissiepunt",
      "description": "Selecteer het emissiepunt waarop je wil rapporteren.",
      "type": "string"
    },
    "featureBron": {
      "title": "Bron(nen)",
      "description": "Selecteer de bron(nen) waarop je wil rapporteren.",
      "type": "string"
    },
```
both have `sosa:hasFeatureOfInterest` as the relation. These should therefore map to hasFeatureOfInterest instead of their own property. As outlined in the project outline, the inner feature of interest wins over the parent, so bron should be the main one.

2. In the output of "lucht" there is a property for afvalproduct, brandstof, ... These have `relevantClass` so they should be their own sosa:Observation and not a proerty of an observation. Meaning I expect subschemas of lucht for afval, brandstof, ..

Similar issues exist for water and other thema's. Analyse and fix
