import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Operational mapping references in publication frames', () => {
    it('keeps measurement, Sampling and selection dependencies flat in JSON-LD, JSON, CSV and Parquet input', () => {
        const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
            import jsonld from 'jsonld';
            import { skosOptions } from './utils/variables.js';
            const skos = 'http://www.w3.org/2004/02/skos/core#';
            const input = {
                '@context': skosOptions.jsonldOptions.frame['@context'],
                '@graph': [
                    { '@id': 'urn:test:observation', '@type': skos + 'Concept',
                      observedProperty: 'urn:test:measurement',
                      ultimateFeatureOfInterestSource: 'urn:test:feature',
                      referenceParent: 'urn:test:feature',
                      referenceRelation: 'urn:test:relation' },
                    { '@id': 'urn:test:measurement', '@type': skos + 'Concept', prefLabel: 'Meetwaarde' },
                    { '@id': 'urn:test:feature', '@type': skos + 'Concept', prefLabel: 'Emissie' },
                    { '@id': 'urn:test:relation', '@type': 'http://www.w3.org/2000/01/rdf-schema#Resource' },
                ],
            };
            const results = [];
            for (const options of [skosOptions.jsonldOptions, skosOptions.jsonOptions,
                skosOptions.csvOptions, skosOptions.parquetOptions]) {
                const framed = await jsonld.frame(input, options.frame);
                results.push((framed.graph ?? [framed]).find(node => node.id === 'urn:test:observation'));
            }
            console.log(JSON.stringify(results));
        `], { cwd: new URL('../src/', import.meta.url), encoding: 'utf8' });
        for (const record of JSON.parse(output.trim())) {
            expect(record.observedProperty).toBe('urn:test:measurement');
            expect(record.ultimateFeatureOfInterestSource).toBe('urn:test:feature');
            expect(record.referenceParent).toBe('urn:test:feature');
            expect(record.referenceRelation).toBe('urn:test:relation');
        }
    });
});
