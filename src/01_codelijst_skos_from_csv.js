'use strict';
import { output } from '@milieuinfo/maven-metadata-generator-npm';
import csv from 'csvtojson';
import {
    skosOptions,
    skosSource,
    versioning,
    versioningPropertyKeys
} from './utils/variables.js';
import { ConceptVersioning } from './utils/versioning.js';
import { separateString, n3_reasoning } from '@milieuinfo/maven-metadata-generator-npm/src/utils/functions.js';


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
    const nt_rdf = await n3_reasoning(jsonld, skosSource.rules);

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
}

generate_skos(skosOptions, skosSource);