'use strict';

/**
 * Conformiteitscontrole van de (relevantClass, relation)-mapping tegen de
 * RIE-IEPR ontologie (riepr.ttl).
 *
 *   :ObservatieVerzameling  sosa:hasMember 1..*, sosa:hasFeatureOfInterest 1
 *   :Observatie             sosa:hasResult 1 -> :Resultaat, sosa:resultTime/phenomenonTime/
 *                           observedProperty/usedProcedure/madeBySensor 0..1
 *   :Resultaat              qudt:numericValue / qudt:hasUnit / rdfs:comment 0..1
 *   :Emissie/:Onttrekking/:Verbruik  sosa:FeatureOfInterest, prov:wasDerivedFrom 1..* :Proces
 *   :Exploitant             prov:Agent, rdfs:label, locn:address, prov:hadPrimarySource
 *
 * Puur informatief: de generatie blijft doorlopen. `http://TODO`-placeholders worden
 * bewust niet gerapporteerd — die staan als openstaand domeinwerk in de README.
 */

/** Predicaten die op een concept mogen staan, per relevantClass. */
const ALLOWED_RELATIONS = {
    'riepr:ObservatieVerzameling': ['sosa:hasFeatureOfInterest'],
    'riepr:Observatie': [
        'sosa:hasResult', 'sosa:resultTime', 'sosa:phenomenonTime',
        'sosa:observedProperty', 'sosa:usedProcedure', 'sosa:madeBySensor',
        'sosa:hasFeatureOfInterest',
    ],
    'riepr:Resultaat': ['qudt:numericValue', 'qudt:hasUnit', 'rdfs:comment'],
    'sosa:FeatureOfInterest': ['sosa:hasFeatureOfInterest', 'prov:wasDerivedFrom'],
    'prov:Agent': ['rdfs:label', 'locn:address', 'prov:hadPrimarySource', 'prov:wasAttributedTo'],
};

/**
 * Predicaten die geen relevantClass van zichzelf hebben: ze zijn een eigenschap
 * van de parent-node (de observatie of de agent), niet een node op zich.
 */
const PARENT_LEVEL_RELATIONS = new Set([
    'sosa:resultTime', 'sosa:phenomenonTime', 'sosa:observedProperty',
    'sosa:usedProcedure', 'sosa:madeBySensor', 'prov:wasAttributedTo',
    'rdfs:label', 'locn:address', 'prov:hadPrimarySource',
]);

/**
 * Predicaten van :Systeemeigenschap (de structurele *_eigenschappen-lijsten).
 * Die horen bij een ander deel van het model en vallen buiten de cube-mapping.
 */
const SYSTEEMEIGENSCHAP_RELATIONS = new Set([
    'rdfs:value', 'riepr:parameter', 'riepr:inGebruikVan', 'qudt:hasUnit',
]);

/** Predicaten die (nog) niet in riepr.ttl gedeclareerd zijn. */
const UNDECLARED_RELATIONS = new Set([
    'rov:registration', 'dcterms:type', 'dcterms:accrualPeriodicity',
    'time:hasDuration', 'schema:material', 'qudt:standardUncertainty',
]);

const first = v => (Array.isArray(v) ? v[0] : v);

/**
 * @param {Array} rows - CSV-rijen na separateString()
 * @returns {{ conflicts: string[], undeclared: string[] }}
 */
function validateCubeMapping(rows) {
    const conflicts = [];
    const undeclared = [];

    rows.forEach(row => {
        const id = row._id;
        const src = row.__source || 'onbekend';
        const cls = (first(row.relevantClass) || '').trim();
        const rel = (first(row.relation) || '').trim();
        if (!id || !cls && !rel) return;
        // Structurele eigenschappenlijsten vallen buiten de cube-mapping.
        if (!cls && SYSTEEMEIGENSCHAP_RELATIONS.has(rel)) return;

        if (rel && UNDECLARED_RELATIONS.has(rel)) {
            undeclared.push(`${src} [${id}] relation '${rel}' is niet gedeclareerd in riepr.ttl`);
            return;
        }
        if (cls && rel) {
            const allowed = ALLOWED_RELATIONS[cls];
            if (allowed && !allowed.includes(rel)) {
                conflicts.push(
                    `${src} [${id}] relation '${rel}' is niet toegelaten op ${cls} ` +
                    `(wel: ${allowed.join(', ')})`
                );
            }
        }
        if (cls && !rel && PARENT_LEVEL_RELATIONS.has(rel)) {
            conflicts.push(`${src} [${id}] '${rel}' is een eigenschap van de parent, relevantClass hoort leeg te zijn`);
        }
        if (!cls && rel && !PARENT_LEVEL_RELATIONS.has(rel) && !UNDECLARED_RELATIONS.has(rel)) {
            conflicts.push(`${src} [${id}] relation '${rel}' zonder relevantClass`);
        }
    });

    return { conflicts, undeclared };
}

/** Print het resultaat; faalt nooit, dit is een signaal geen poort. */
function reportCubeMapping(rows) {
    const { conflicts, undeclared } = validateCubeMapping(rows);
    if (conflicts.length > 0) {
        console.warn(`\n=== Cube-mapping: ${conflicts.length} conflict(en) met riepr.ttl ===`);
        conflicts.forEach(c => console.warn(`  - ${c}`));
    }
    if (undeclared.length > 0) {
        console.warn(`\n=== Cube-mapping: ${undeclared.length} predicaat/predicaten nog niet in riepr.ttl ===`);
        undeclared.forEach(c => console.warn(`  - ${c}`));
    }
    if (conflicts.length === 0 && undeclared.length === 0) {
        console.log('Cube-mapping: alle (relevantClass, relation)-combinaties conform riepr.ttl.');
    }
    return { conflicts, undeclared };
}

export { validateCubeMapping, reportCubeMapping, ALLOWED_RELATIONS, PARENT_LEVEL_RELATIONS, UNDECLARED_RELATIONS, SYSTEEMEIGENSCHAP_RELATIONS };
