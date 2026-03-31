'use strict';
import { output } from '@milieuinfo/maven-metadata-generator-npm';
import csv from 'csvtojson';
import {
    skosOptions,
    skosSource
} from './utils/variables.js';
import { ConceptVersioning } from './utils/versioning.js';
import { separateString, n3_reasoning } from '@milieuinfo/maven-metadata-generator-npm/src/utils/functions.js';


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
    const csvResults = await Promise.all(sourcePaths.map(p => csv(csvOptions).fromFile(p)));
    const mergedJson = csvResults.flat();
    const new_json = mergedJson.map(row => {
        const object = {};
        Object.keys(row).forEach(key => { object[key] = separateString(row[key]); });
        return object;
    });
    let jsonld = {"@graph": new_json, "@context": skosSource.contextPrefixes};
    console.log("1: Csv to Jsonld");
    const nt_rdf = await n3_reasoning(jsonld, skosSource.rules);

    const versioner = new ConceptVersioning();
    // Versioning will be applied directly on the N-Quads RDF string (in-memory only).
    const { updated_nt, result } = await versioner.process({ currentNt: nt_rdf, frame: skosOptions.jsonldOptions.frame, options: { allowMultipleIsVersionOf: true } });
    console.log('Versioning result:', result);
    await output(skosSource, updated_nt, options);
}

generate_skos(skosOptions, skosSource);