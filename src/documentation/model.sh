#!/bin/bash
  sparql --results=TTL --data=/home/gehau/git/codelijst-rie-iepr/target/classes/be/vlaanderen/omgeving/data/id/dataset/codelijst-rie-iepr/dataset.ttl  --query model.rq | sed -e 's;label;Label;'  > model.ttl
  rdf2dot  model.ttl | dot -Tpng > model.png
  rdf2dot  model.ttl  > model.dot

