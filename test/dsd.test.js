import { afterEach, describe, expect, it } from 'vitest';
import rdf from '@zazuko/env-node';
import { Readable } from 'node:stream';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDsdDocuments } from '../src/utils/dsd.js';
import { generateDsds } from '../src/04_dsd_from_codelists.js';

const prefixes = `
    @prefix c: <https://data.omgeving.vlaanderen.be/id/concept/riepr/test/> .
    @prefix v: <https://data.riepr.omgeving.vlaanderen.be/ns/vocab#> .
    @prefix riepr: <https://data.riepr.omgeving.vlaanderen.be/ns/riepr#> .
    @prefix skos: <http://www.w3.org/2004/02/skos/core#> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix part: <http://purl.org/iso25964/skos-thes#> .
    @prefix sosa: <http://www.w3.org/ns/sosa/> .
    @prefix qudt: <http://qudt.org/schema/qudt/> .
    @prefix dct: <http://purl.org/dc/terms/> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`;
const QB = 'http://purl.org/linked-data/cube#';
const QUDT = 'http://qudt.org/schema/qudt/';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const VOCAB = 'https://data.riepr.omgeving.vlaanderen.be/ns/vocab#';
const C = 'https://data.omgeving.vlaanderen.be/id/concept/riepr/test/';
const objects = (graph, subject, predicate) =>
    [...graph.match(rdf.namedNode(subject), rdf.namedNode(predicate))].map(({ object }) => object.value);
const parse = turtle => rdf.dataset().import(rdf.formats.parsers.import('text/turtle', Readable.from([turtle])));
const compile = async turtle => createDsdDocuments(await parse(prefixes + turtle));
const component = (document, role, predicate) =>
    [...document.graph.match(null, rdf.namedNode(QB + role), rdf.namedNode(predicate))][0]?.subject.value;
const explicit = `
    c:observation sh:class riepr:Observatie .
    c:result sh:class riepr:Resultaat; part:broaderPartitive c:observation;
        dct:relation sosa:hasResult; skos:prefLabel "Resultaat"@nl;
        skos:definition "Een waarde, met \\"aanhalingstekens\\".\\nTweede regel."@nl .
    c:value part:broaderPartitive c:result; dct:relation qudt:numericValue;
        v:relevantDataType xsd:decimal; qudt:relevantUnit c:units; v:isVerplicht true;
        v:kwantiteitsAspect c:mass; v:drager c:water; v:soortWaartbepaling c:standard;
        v:variabele c:selector .
    c:selector v:relevantCodeList c:variables .
    c:variables a skos:Collection; skos:member c:nitrogen, c:phosphorus, <https://example.test/with,comma> .
    c:units a skos:Collection; skos:member c:unit, c:moreUnits .
    c:moreUnits a skos:Collection; skos:member c:otherUnit .
    c:limit part:broaderPartitive c:result; dct:relation v:bepalingsgrensindicator;
        v:relevantCodeList c:limits .
    c:limits a skos:ConceptScheme .
    c:above skos:inScheme c:limits .
    c:time part:broaderPartitive c:observation; dct:relation sosa:resultTime .
`;
let temporary;
afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    temporary = undefined;
});

describe('Separate RDF Cube DSD generation', () => {
    it('derives explicit results, CSOR dimensions, real unit members and optional result attributes', async () => {
        const [document] = await compile(explicit);
        expect(document.source).toBe(C + 'result');
        expect(document.relativePath).toBe('riepr/test/result.ttl');
        expect(component(document, 'measure', QUDT + 'numericValue')).toBeTruthy();
        for (const name of ['variabele', 'kwantiteitsAspect', 'drager', 'soortWaartbepaling']) {
            expect(component(document, 'dimension', VOCAB + name)).toBeTruthy();
        }
        for (const name of ['bronObservatie', 'referentieObject', 'verslagjaar']) {
            const predicate = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#' + name;
            const context = component(document, 'dimension', predicate);
            expect(context).toBeTruthy();
            expect(objects(document.graph, context, 'http://purl.org/dc/terms/source')).toEqual([predicate]);
            expect(objects(document.graph, predicate, 'http://www.w3.org/2000/01/rdf-schema#range')).toHaveLength(1);
        }
        const unit = component(document, 'attribute', QUDT + 'hasUnit');
        expect(objects(document.graph, unit, QB + 'componentRequired')).toEqual(['true']);
        const unitList = objects(document.graph, QUDT + 'hasUnit', QB + 'codeList')[0];
        expect(unitList).toBe(C + 'units');
        expect(document.graph.match(rdf.namedNode(unitList)).size).toBe(0);
        const limit = component(document, 'attribute', VOCAB + 'bepalingsgrensindicator');
        expect(objects(document.graph, limit, QB + 'componentRequired')).toEqual(['false']);
        expect(component(document, 'attribute', 'http://www.w3.org/ns/sosa/resultTime')).toBeUndefined();
        expect(objects(document.graph, document.id, 'http://purl.org/dc/terms/source')).toEqual([C + 'result']);
        for (const code of ['unit', 'otherUnit', 'nitrogen', 'phosphorus', 'above', 'water', 'mass', 'standard']) {
            expect(document.graph.match(rdf.namedNode(C + code)).size).toBe(0);
        }
    });

    it('supports scalar results without guessing units and keeps shared property domains mergeable', async () => {
        const documents = await compile(`
            c:count sh:class riepr:Observatie; v:relevantDataType xsd:integer .
            c:mass sh:class riepr:Observatie; v:relevantDataType xsd:decimal; qudt:relevantUnit c:kilogram .
            c:withdrawn sh:class riepr:Observatie; v:relevantDataType xsd:integer;
                <http://www.w3.org/ns/adms#status> <https://purl.archive.org/adms/status/Withdrawn> .
        `);
        expect(documents.map(document => document.source)).toEqual([C + 'count', C + 'mass']);
        expect(component(documents[0], 'attribute', QUDT + 'hasUnit')).toBeUndefined();
        expect(component(documents[1], 'attribute', QUDT + 'hasUnit')).toBeTruthy();
        for (const document of documents) {
            expect(objects(document.graph, QUDT + 'numericValue', 'http://www.w3.org/2000/01/rdf-schema#range'))
                .toEqual(['http://www.w3.org/2001/XMLSchema#decimal']);
        }
    });

    it('derives implicit results with redirected ownership, leaving SOSA context outside Resultaat', async () => {
        const [document] = await compile(`
            c:observation sh:class riepr:Observatie .
            c:value v:relevantObservation c:observation; v:relevantDataType xsd:decimal .
            c:time v:relevantObservation c:observation; dct:relation sosa:resultTime .
            c:method v:relevantObservation c:observation; dct:relation sosa:usedProcedure .
            c:feature v:relevantObservation c:observation; sh:class sosa:FeatureOfInterest;
                v:relevantRiepr c:installation; dct:relation sosa:hasFeatureOfInterest .
            c:comment v:relevantObservation c:observation; dct:relation v:remark;
                v:relevantDataType xsd:string; v:isVerplicht true; sh:path c:trigger .
        `);
        expect(component(document, 'measure', QUDT + 'numericValue')).toBeTruthy();
        expect([...document.graph.match(null, rdf.namedNode(QB + 'attribute'))].map(quad => quad.object.value))
            .toEqual([
                'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#meetmoment',
                'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#meetperiode',
                VOCAB + 'remark',
            ]);
        expect(objects(document.graph, component(document, 'attribute', VOCAB + 'remark'), QB + 'componentRequired'))
            .toEqual(['false']);
    });

    it('does not restrict shared coded and free-text predicates to a global code list', async () => {
        const documents = await compile(explicit + `
            c:codedMethod part:broaderPartitive c:result; dct:relation v:method;
                v:relevantCodeList c:methods .
            c:methods a skos:Collection; skos:member c:measured .
            c:textObservation sh:class riepr:Observatie; v:relevantDataType xsd:decimal .
            c:textMethod part:broaderPartitive c:textObservation; dct:relation v:method;
                v:relevantDataType xsd:string .
        `);
        expect(documents).toHaveLength(2);
        for (const document of documents) {
            expect(component(document, 'attribute', VOCAB + 'method')).toBeTruthy();
            expect(objects(document.graph, VOCAB + 'method', QB + 'codeList')).toEqual([]);
            expect(objects(document.graph, VOCAB + 'method', 'http://www.w3.org/2000/01/rdf-schema#range'))
                .toEqual(['http://www.w3.org/2000/01/rdf-schema#Resource']);
            expect(document.graph.has(rdf.quad(rdf.namedNode(VOCAB + 'method'),
                rdf.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdf.namedNode(QB + 'CodedProperty'))))
                .toBe(false);
        }
    });

    it('keeps a union collection when a shared predicate uses different source collections', async () => {
        const documents = await compile(explicit + `
            c:other sh:class riepr:Observatie; v:relevantDataType xsd:decimal; qudt:relevantUnit c:thirdUnit .
        `);
        for (const document of documents) {
            const list = objects(document.graph, QUDT + 'hasUnit', QB + 'codeList')[0];
            expect(list).not.toBe(C + 'units');
            expect(objects(document.graph, list, SKOS + 'member')).toEqual([C + 'otherUnit', C + 'thirdUnit', C + 'unit']);
        }
    });

    it.each([
        [explicit.replace('dct:relation v:bepalingsgrensindicator;', ''), /zonder RDF-predicaat/],
        [explicit.replace('v:relevantCodeList c:variables', 'v:relevantCodeList c:missing'), /ontbreekt/],
        [explicit.replace('skos:member c:otherUnit', 'skos:member c:units'), /cyclische codelijst/],
        [explicit.replace('v:relevantDataType xsd:decimal;', ''), /zonder numeriek datatype/],
        [explicit.replace('dct:relation qudt:numericValue', 'dct:relation v:other'), /zonder numerieke meetwaarde/],
    ])('rejects incomplete or cyclic source metadata', async (turtle, error) => {
        await expect(compile(turtle)).rejects.toThrow(error);
    });

    it('writes only separate Turtle files, removes stale DSDs and preserves them on compilation failure', async () => {
        temporary = await mkdtemp(path.join(tmpdir(), 'riepr-dsd-'));
        const input = path.join(temporary, 'codelist.ttl');
        const output = path.join(temporary, 'dsd');
        await writeFile(input, prefixes + explicit);
        await mkdir(output);
        await writeFile(path.join(output, 'stale.ttl'), 'old');
        await writeFile(path.join(output, 'keep.txt'), 'unrelated');
        const before = await readFile(input, 'utf8');
        const [document] = await generateDsds(input, output);
        const generated = path.join(output, document.relativePath);
        const turtle = await readFile(generated, 'utf8');
        expect(turtle).toContain('@prefix qb: <http://purl.org/linked-data/cube#>.');
        expect(turtle).toContain('@prefix c: <https://data.omgeving.vlaanderen.be/id/concept/riepr/test/>.');
        expect(turtle).toContain('@prefix sosa:');
        expect(turtle).toMatch(/\n +dct:source c:result[;\n]/);
        expect(turtle).toMatch(/,\n {8}comp-v:/);
        expect(turtle).toMatch(/\.\n\ndsd:result/);
        const graph = await parse(turtle);
        expect(graph.size).toBe(document.graph.size);
        for (const statement of document.graph) expect(graph.has(statement)).toBe(true);
        expect(objects(graph, document.id, 'http://purl.org/dc/terms/source')).toEqual([C + 'result']);
        expect(await readdir(output)).toEqual(['keep.txt', 'riepr']);
        expect(await readFile(input, 'utf8')).toBe(before);
        await writeFile(input, prefixes + explicit.replace('v:relevantCodeList c:variables', 'v:relevantCodeList c:missing'));
        await expect(generateDsds(input, output)).rejects.toThrow(/ontbreekt/);
        expect(await readFile(generated, 'utf8')).toBe(turtle);
    });
});
