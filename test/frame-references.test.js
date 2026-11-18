import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Operational mapping references in publication frames', () => {
    it('keeps measurement and Sampling source references flat in JSON-LD, JSON, CSV and Parquet input', () => {
        const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
            import jsonld from 'jsonld';
            import { skosOptions } from './utils/variables.js';
            const skos = 'http://www.w3.org/2004/02/skos/core#';
            const input = {
                '@context': skosOptions.jsonldOptions.frame['@context'],
                '@graph': [
                    { '@id': 'urn:test:observation', '@type': skos + 'Concept',
                      observedProperty: 'urn:test:measurement',
                      ultimateFeatureOfInterestSource: 'urn:test:feature' },
                    { '@id': 'urn:test:measurement', '@type': skos + 'Concept', prefLabel: 'Meetwaarde' },
                    { '@id': 'urn:test:feature', '@type': skos + 'Concept', prefLabel: 'Emissie' },
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
        }
    });
});
