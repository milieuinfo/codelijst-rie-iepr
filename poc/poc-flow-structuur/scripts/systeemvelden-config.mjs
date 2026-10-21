/**
 * @file Configuration for `scripts/build-systeemvelden.mjs` (plan 05).
 *
 * Every entry here is a deliberate, reviewable decision. Adjust this file when
 * the data model (`riepr.ttl`) changes, then rerun `npm run sync:velden`.
 */

/** The six systemen, mapped to their `riepr.ttl` class and generated JSON key. */
export const SYSTEMEN = [
  { sleutel: 'installatie', klasse: 'Installatie' },
  { sleutel: 'emissiepunt', klasse: 'Emissiepunt' },
  { sleutel: 'filter', klasse: 'Filter' },
  { sleutel: 'meetpunt', klasse: 'Meetpunt' },
  { sleutel: 'uitwisselpunt', klasse: 'Uitwisselpunt' },
  { sleutel: 'onttrekkingspunt', klasse: 'Onttrekkingspunt' },
]

/**
 * Dutch labels for the properties that survive the exclusion list.
 * `rdfs:label` → "Naam" instead of the literal "Label".
 */
export const LABELS = {
  'rdfs:label': 'Naam',
  'rdfs:comment': 'Beschrijving',
  ':inGebruikVanaf': 'In gebruik vanaf',
  ':inGebruikTot': 'In gebruik tot',
  'adms:identifier': 'Externe identificatie',
}

/**
 * Properties that are never filled in by the user in this formulier.
 * Keyed by the CURIE as it appears in `riepr.ttl`.
 */
export const UITGESLOTEN = {
  'dct:created': 'Systeembeheerd: wordt bij het aanmaken gezet.',
  'dct:modified': 'Systeembeheerd: wordt bij elke wijziging gezet.',
  'dct:issued': 'Geldigheid van de aangifte, niet van het systeem; volgt uit de rapporteringsperiode.',
  'dct:valid': 'Geldigheid van de aangifte, niet van het systeem; volgt uit de rapporteringsperiode.',
  'adms:status': 'Systeembeheerd: status van de aangifte.',
  ':aangifte': 'Verwijzing naar de aangifte; wordt door het systeem gelegd.',
  ':ingediend': 'Verwijzing naar de aangifte; wordt door het systeem gelegd.',
  'ssn:hasDeployment': 'Relatie met exploitaties; systeembeheerd.',
  'ssn:hasSubSystem': 'Structuurrelatie tussen systemen (bv. filters onder een meetpunt); apart beheerd.',
  'ogc:hasGeometry': 'Geometrie wordt op de kaart bepaald, niet in dit formulier.',
  'dct:type': 'Komt uit de typeselector (plan 04).',
  'ssn:hasProperty': 'Systeemeigenschappen worden apart gerenderd (plannen 02 en 06).',
}

/**
 * Properties that the data model declares without `owl:maxCardinality` but
 * that are single-valued in practice. Without this override the generated
 * `meervoudig` flag would be true and the UI would offer "toevoegen"-rijen for
 * a name or description.
 */
export const ENKELVOUDIG = {
  'rdfs:label': 'Eén benaming per systeem; het datamodel laat de maxCardinality weg omdat een label meertalig mag zijn.',
  'rdfs:comment': 'Eén beschrijving per systeem; idem voor de maxCardinality.',
}
