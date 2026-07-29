'use strict';
import { output } from '@milieuinfo/maven-metadata-generator-npm';
import csv from 'csvtojson';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
    skosOptions,
    skosSource,
    versioning,
    versioningPropertyKeys
} from './utils/variables.js';
import { ConceptVersioning } from './utils/versioning.js';
import { separateString, n3_reasoning } from '@milieuinfo/maven-metadata-generator-npm/src/utils/functions.js';


// Resolve paths relative to this script's directory (src/)
const SRC_DIR = path.dirname(new URL(import.meta.url).pathname);
const VALIDATION_JSON_PATH = path.resolve(SRC_DIR, '../validation/validation_result.json');

/** SHACL shape IRIs → human-readable labels */
const SHAPE_LABELS = {
    'https://data.omgeving.vlaanderen.be/id/propertyshape/prefLabel': 'prefLabel',
    'https://data.omgeving.vlaanderen.be/id/propertyshape/inScheme': 'inScheme',
    'https://data.omgeving.vlaanderen.be/id/propertyshape/definition': 'definition',
    'https://data.omgeving.vlaanderen.be/id/propertyshape/scopeNote': 'scopeNote',
};

/** Constraint component IRIs → human-readable labels */
const CONSTRAINT_LABELS = {
    'http://www.w3.org/ns/shacl#MinCountConstraintComponent': 'minCount (minimum values required)',
    'http://www.w3.org/ns/shacl#MaxCountConstraintComponent': 'maxCount (maximum values allowed)',
    'http://www.w3.org/ns/shacl#PatternConstraintComponent': 'pattern (regex pattern match)',
    'http://www.w3.org/ns/shacl#NodeConstraintComponent': 'node (type constraint)',
    'http://www.w3.org/ns/shacl#DatatypeConstraintComponent': 'datatype (value type)',
    'http://www.w3.org/ns/shacl#ClassConstraintComponent': 'class (RDF class membership)',
    'http://www.w3.org/ns/shacl#UniqueLangConstraintComponent': 'uniqueLang (language uniqueness)',
};


/**
 * Extract a clean prefix:name from an IRI.
 * e.g., "http://www.w3.org/2001/XMLSchema#date" → "xsd:date"
 *        "http://www.w3.org/2004/02/skos/core#prefLabel" → "skos:prefLabel"
 */
function iriToShortName(iri) {
    if (!iri) return '(unknown)';
    // Split on # or / and take the last segment
    let local = iri.split(/[#\/]/).pop();
    // Map common prefixes
    const prefixMap = {
        'http://www.w3.org/2001/XMLSchema': 'xsd',
        'http://www.w3.org/2004/02/skos/core': 'skos',
        'http://www.w3.org/ns/shacl': 'sh',
        'http://purl.org/dc/terms': 'dct',
    };
    for (const [prefix, short] of Object.entries(prefixMap)) {
        if (iri.startsWith(prefix + '#') || iri.startsWith(prefix + '/')) {
            return `${short}:${local}`;
        }
    }
    return local;
}

/**
 * Check if an IRI belongs to a known external ontology that should NOT be
 * validated as a SKOS concept. These are type definitions pulled in by the
 * N3 reasoner from CSV `relevantDataType` columns — they get inferred as
 * skos:Concept via the default skos-rules.n3 but have no prefLabel/inScheme.
 */
function isExcludedExternalUri(uri) {
    if (!uri) return false;
    const excludedPrefixes = [
        'http://www.w3.org/2001/XMLSchema#',   // xsd:date, xsd:string, ...
        'http://www.w3.org/2002/07/owl#',      // owl classes
        'http://www.w3.org/2004/02/skos/core#',// skos internal types
        'http://purl.org/dc/terms/',           // dcterms
    ];
    return excludedPrefixes.some(p => uri.startsWith(p));
}

/**
 * Filter out "orphaned" concepts from the N-Quads output:
 * nodes whose URIs match excluded prefixes AND lack both skos:prefLabel
 * and skos:inScheme. Legitimate external concepts (e.g., QUDT units with
 * full metadata) are kept; orphaned type definitions (xsd:date, etc.) are removed.
 */
function filterOrphanedConcepts(ntString) {
    const LINES = ntString.split('\n').filter(Boolean);
    if (LINES.length === 0) return { filteredNt: ntString, subjectsRemoved: [] };

    // Build a map: subjectUri → Set of property IRIs present in the graph
    const subjectProps = new Map();
    for (const line of LINES) {
        // Parse: <subject> <predicate> <object> [. [graph]]
        const m = line.match(/^<([^>]*)>\s+<([^>]*)>/);
        if (!m) continue;
        const subj = m[1];
        const pred = m[2];
        if (!subjectProps.has(subj)) subjectProps.set(subj, new Set());
        subjectProps.get(subj).add(pred);
    }

    const PREF_LABEL_IRI = 'http://www.w3.org/2004/02/skos/core#prefLabel';
    const IN_SCHEME_IRI = 'http://www.w3.org/2004/02/skos/core#inScheme';

    // Identify subjects to remove: excluded prefix + missing prefLabel AND inScheme
    const subjectsToRemove = new Set();
    for (const [subj, props] of subjectProps) {
        if (isExcludedExternalUri(subj) && !props.has(PREF_LABEL_IRI) && !props.has(IN_SCHEME_IRI)) {
            subjectsToRemove.add(subj);
        }
    }

    if (subjectsToRemove.size === 0) return { filteredNt: ntString, subjectsRemoved: [] };

    // Remove all triples whose subject is in subjectsToRemove
    const cleanedLines = LINES.filter(line => {
        const match = line.match(/^<([^>]*)>/);
        if (!match) return true; // keep non-triple lines (empty, comments)
        return !subjectsToRemove.has(match[1]);
    });

    const removedNames = [...subjectsToRemove].map(uri => iriToShortName(uri));
    console.warn(`Filtered orphaned concepts (no prefLabel/inScheme): ${removedNames.join(', ')}`);

    return { filteredNt: cleanedLines.join('\n'), subjectsRemoved: removedNames };
}

/**
 * Read the validation result JSON and print clear error messages for each violation.
 * Excludes known external URIs (xsd:, owl:, qudt:, etc.) that are not user-facing
 * SKOS concepts — they get inferred as skos:Concept by the N3 reasoner but have
 * no prefLabel/inScheme because they're type definitions, not codelijst entries.
 *
 * Returns true if there were violations worth reporting, false otherwise.
 */
function printValidationErrors() {
    if (!existsSync(VALIDATION_JSON_PATH)) {
        return false;
    }

    let reportData;
    try {
        reportData = JSON.parse(readFileSync(VALIDATION_JSON_PATH, 'utf-8'));
    } catch {
        console.error('\n[!] Validation result file exists but could not be parsed.');
        return false;
    }

    // Find all ValidationResult entries in the array
    const results = reportData.filter(item => item._type === 'http://www.w3.org/ns/shacl#ValidationResult');

    if (results.length === 0) {
        return false;
    }

    // Filter out violations from excluded external URIs
    const relevantResults = [];
    const skippedCount = [];
    for (const r of results) {
        const focusNodeUri = r.focusNode || '';
        if (isExcludedExternalUri(focusNodeUri)) {
            const name = iriToShortName(focusNodeUri);
            skippedCount.push(name);
        } else {
            relevantResults.push(r);
        }
    }

    // If only excluded URIs failed, skip reporting — they're expected.
    if (relevantResults.length === 0) {
        const uniqueSkipped = [...new Set(skippedCount)];
        if (uniqueSkipped.length > 0) {
            console.log(`\n(${uniqueSkipped.join(', ')} excluded from SHACL validation: these are external type definitions, not codelijst concepts.)`);
        }
        return false;
    }

    console.error(`\n=== SHACL Validation Failed (${relevantResults.length} violation(s), ${skippedCount.length} excluded) ===`);
    console.error('');

    relevantResults.forEach((r, i) => {
        const focusNodeUri = r.focusNode || '';
        const focusNodeName = iriToShortName(focusNodeUri);
        const propIri = r.resultPath || '';
        const propName = iriToShortName(propIri);
        const constraintType = CONSTRAINT_LABELS[r.sourceConstraintComponent] || r.sourceConstraintComponent?.split('#').pop() || 'unknown';
        const shapeName = SHAPE_LABELS[r.sourceShape] || r.sourceShape?.split('/').pop() || '(unknown shape)';
        const message = r.resultMessage || '';

        console.error(`  ${i + 1}. [${focusNodeName}] Missing/invalid ${propName}`);
        console.error(`     Constraint: ${shapeName} → ${constraintType}`);
        if (message) {
            console.error(`     Detail: ${message}`);
        }
        console.error('');
    });

    console.error(`Full validation details written to: ${VALIDATION_JSON_PATH.replace(SRC_DIR, '.')}`);
    return true;
}


/**
 * Validates that all relevantRiepr references point to existing concept IDs.
 * @param {Array} concepts - Array of concept objects with _id and relevantRiepr fields
 * @returns {{ errors: string[] }}
 */
function validateRelevantRiepr(concepts) {
    const existingIds = new Set();
    concepts.forEach(c => {
        if (c._id) {
            existingIds.add(c._id);
        }
    });

    const errors = [];
    concepts.forEach((concept, index) => {
        if (!concept.relevantRiepr || !concept.relevantRiepr.trim()) return;

        const rieprValues = concept.relevantRiepr.split(',').map(v => v.trim()).filter(Boolean);
        rieprValues.forEach(rieprValue => {
            // Skip external URIs (e.g., http://...)
            if (rieprValue.startsWith('http://') || rieprValue.startsWith('https://')) return;

            if (!existingIds.has(rieprValue)) {
                const sourceFile = concept.__source ? ` (${concept.__source})` : '';
                errors.push(
                    `Row ${index + 1}${sourceFile}: relevantRiepr '${rieprValue}' does not reference an existing concept. ` +
                    `Available concept IDs: see _id column across all CSV files.`
                );
            }
        });
    });

    return { errors };
}

/**
 * MODIFIED: om versionering toe te laten
 * 
 * Generates SKOS (Simple Knowledge Organization System) files from CSV.
 * Converts CSV to JSON-LD, applies N3 reasoning, and outputs in various formats.
 * @async
 * @param {SkosSource} skosSource
 * @param {OutputOptions} options
 * @throws {Error} If options object contains no specified output.
 * @throws {TypeError} If OutputOptions is not an object.
 */
async function generate_skos(options, skosSource ) {
    if (typeof options !== "object"){
        throw new TypeError('Expected an object');
    }
    if (![
        options.turtlePath,
        options.jsonldOptions?.file,
        options.jsonOptions?.file,
        options.csvOptions?.file,
        options.ntriplesPath,
        options.xsdOptions?.file,
        options.parquetOptions?.file
    ].some(Boolean)) {
        throw new Error('Invalid options: no specified output.');
    }
    console.log("skos generation: csv to jsonld");
    const sourcePaths = skosSource.sourcePaths ?? [skosSource.sourcePath];
    const csvOptions = { ignoreEmpty: true, flatKeys: true };
    const csvResults = await Promise.all(
        sourcePaths.map(async (p) => {
            const rows = await csv(csvOptions).fromFile(p);
            const fileName = p.split('/').pop() || p;
            return rows.map(row => ({ ...row, __source: fileName }));
        })
    );
    const mergedJson = csvResults.flat();
    const new_json = mergedJson.map(row => {
        const object = { __source: row.__source };
        Object.keys(row).forEach(key => {
            if (key !== '__source') {
                object[key] = separateString(row[key]);
            }
        });
        return object;
    });

    // Validate that all relevantRiepr references point to existing concepts
    const validation = validateRelevantRiepr(new_json);
    if (validation.errors.length > 0) {
        console.error('\n=== Validation Errors ===');
        validation.errors.forEach(err => console.error(`  - ${err}`));
        throw new Error(`${validation.errors.length} validation error(s) found in relevantRiepr references.`);
    }

    let jsonld = {"@graph": new_json, "@context": skosSource.contextPrefixes};
    console.log("1: Csv to Jsonld");
    let nt_rdf = await n3_reasoning(jsonld, skosSource.rules);

    // Remove "orphaned" concept triples: nodes that match an excluded prefix
    // AND lack both skos:prefLabel and skos:inScheme. This catches XSD type
    // definitions promoted to skos:Concept by the reasoner while keeping
    // legitimate external concepts (e.g., QUDT units with full metadata).
    const { filteredNt, subjectsRemoved } = filterOrphanedConcepts(nt_rdf);
    nt_rdf = filteredNt;

    const versioner = new ConceptVersioning(versioningPropertyKeys);
    // Versioning will be applied directly on the N-Quads RDF string (in-memory only),
    // diffed against the previously published graph (versioning.release_url in config.yml).
    const { updated_nt, result } = await versioner.process({
        currentNt: nt_rdf,
        frame: skosOptions.jsonldOptions.frame,
        options: { allowMultipleIsVersionOf: true },
        previousReleaseUrl: versioning.enabled ? versioning.release_url : undefined,
    });
    console.log('Versioning result:', result);
    await output(skosSource, updated_nt, options);

    // After output(), check for SHACL validation errors and print them clearly
    const hasViolations = printValidationErrors();
    if (hasViolations) {
        process.exit(1);
    }
}

generate_skos(skosOptions, skosSource);
