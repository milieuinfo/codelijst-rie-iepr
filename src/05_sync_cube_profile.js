import rdf from '@zazuko/env-node';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RIEPR = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const QB = 'http://purl.org/linked-data/cube#';
const SH = 'http://www.w3.org/ns/shacl#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const HYDRA = 'http://www.w3.org/ns/hydra/core#';
const target = new URL('./generated/cube-profile.json', import.meta.url);

export async function syncCubeProfile(source) {
    const graph = await rdf.dataset().import(rdf.fromFile(fileURLToPath(source)));
    const objects = (subject, predicate) => [...graph.match(rdf.namedNode(subject), rdf.namedNode(predicate))].map(quad => quad.object);
    const terms = (subject, predicate) => [...graph.match(subject, rdf.namedNode(predicate))].map(quad => quad.object);
    const only = (subject, predicate) => {
        const values = terms(subject, predicate);
        if (values.length !== 1) throw new Error(`${subject.value}: verwacht precies een ${predicate}.`);
        return values[0];
    };
    const contextPath = (term, seen = new Set()) => {
        if (term.termType === 'NamedNode') return [{ predicate: term.value }];
        if (seen.has(term.value)) throw new Error(`Cyclisch Cube-contextpad: ${term.value}.`);
        const next = new Set([...seen, term.value]);
        const inverse = terms(term, SH + 'inversePath');
        if (inverse.length) {
            if (inverse.length !== 1 || inverse[0].termType !== 'NamedNode') throw new Error('Ongeldig invers contextpad.');
            return [{ predicate: inverse[0].value, inverse: true }];
        }
        const first = only(term, RDF + 'first');
        const rest = only(term, RDF + 'rest');
        return [...contextPath(first, next), ...(rest.value === RDF + 'nil' ? [] : contextPath(rest, next))];
    };
    const properties = new Map();
    for (const role of ['dimension', 'measure', 'attribute']) {
        const type = QB + role[0].toUpperCase() + role.slice(1) + 'Property';
        for (const { subject } of graph.match(null, rdf.namedNode(RDF + 'type'), rdf.namedNode(type))) {
            if (properties.has(subject.value)) throw new Error(`Conflicterende Cube-rollen: ${subject.value}.`);
            const ranges = terms(subject, RDFS + 'range');
            const paths = terms(subject, RIEPR + 'contextPad');
            if (ranges.length > 1 || paths.length > 1) throw new Error(`Meerdere Cube-bereiken of contextpaden: ${subject.value}.`);
            if (paths.length && (!ranges.length || ranges[0].termType !== 'NamedNode')) {
                throw new Error(`Contextpredicaat zonder expliciet bereik: ${subject.value}.`);
            }
            properties.set(subject.value, {
                predicate: subject.value, role,
                ...(ranges[0]?.termType === 'NamedNode' ? { range: ranges[0].value } : {}),
                ...(paths.length ? { path: contextPath(paths[0]) } : {}),
                ...(terms(subject, RDFS + 'label').length ? { label: terms(subject, RDFS + 'label')[0].value } : {}),
            });
        }
    }
    if (!properties.size || ![...properties.values()].some(property => property.role === 'measure')) {
        throw new Error('De ontologie bevat geen volledig Cube-profiel.');
    }
    const restrictions = objects(RIEPR + 'Resultaat', RDFS + 'subClassOf').filter(term =>
        terms(term, OWL + 'onProperty').some(property => property.value === QB + 'dataSet'));
    if (restrictions.length !== 1) throw new Error('Resultaat moet precies een datasetrestrictie declareren.');
    const datasetClass = only(restrictions[0], OWL + 'allValuesFrom');
    const search = only(datasetClass, HYDRA + 'search');
    const template = only(search, HYDRA + 'template').value;
    const mappings = {};
    for (const mapping of terms(search, HYDRA + 'mapping')) {
        const variable = only(mapping, HYDRA + 'variable').value;
        if (mappings[variable] || only(mapping, HYDRA + 'required').value !== 'true') throw new Error(`Ongeldige datasetmapping: ${variable}.`);
        mappings[variable] = only(mapping, HYDRA + 'property').value;
    }
    const variables = [...template.matchAll(/\{([a-z]+)\}/g)].map(match => match[1]);
    if (variables.length !== Object.keys(mappings).length || variables.some(variable => !mappings[variable])) {
        throw new Error('Datasettemplate en mappings komen niet overeen.');
    }
    const profile = {
        ontology: {
            source: 'RIE-IEPR/src/main/resources/be/vlaanderen/omgeving/riepr/data/ns/riepr/riepr.ttl',
            sha256: createHash('sha256').update(await readFile(source)).digest('hex'),
        },
        properties: [...properties.values()].sort((a, b) => a.predicate.localeCompare(b.predicate)),
        sharedContext: objects(RIEPR + 'ObservatieVerzameling', RIEPR + 'gedeeldeContext').map(term => term.value).sort(),
        dataset: { className: datasetClass.value, template, mappings },
    };
    if (!profile.sharedContext.length) throw new Error('Gedeelde observatiecontext ontbreekt in het Cube-profiel.');
    await mkdir(new URL('./generated/', import.meta.url), { recursive: true });
    await writeFile(target, JSON.stringify(profile, null, 2) + '\n');
    console.log(`Cube-profiel gesynchroniseerd uit ${fileURLToPath(source)}.`);
    return profile;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const source = process.argv[2] ? pathToFileURL(path.resolve(process.argv[2]))
        : new URL('../../RIE-IEPR/src/main/resources/be/vlaanderen/omgeving/riepr/data/ns/riepr/riepr.ttl', import.meta.url);
    await syncCubeProfile(source);
}
