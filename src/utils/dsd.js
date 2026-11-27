import rdf from '@zazuko/env-node';
import { cubeProfile, cubeRoles, resultDsd } from './cube-profile.js';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const SOSA = 'http://www.w3.org/ns/sosa/';
const QUDT = 'http://qudt.org/schema/qudt/';
const QB = 'http://purl.org/linked-data/cube#';
const DCT = 'http://purl.org/dc/terms/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const VOCAB = 'https://data.riepr.omgeving.vlaanderen.be/ns/vocab#';
const RIEPR = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#';
const CONCEPT = 'https://data.omgeving.vlaanderen.be/id/concept/';
const DSD = 'https://data.omgeving.vlaanderen.be/id/dsd/';
const numericTypes = new Set(['decimal', 'integer', 'double', 'float'].map(type => XSD + type));
const dimensions = new Set(cubeProfile.properties.filter(property => property.role === 'dimension').map(property => property.predicate));

/**
 * Compile the source-owned Resultaat shapes, including implicit results of numeric
 * Observaties. This deliberately does not follow navigation or reporting POC profiles.
 */
export function createDsdDocuments(source) {
    const nodes = new Map();
    for (const { subject, predicate, object } of source) {
        if (!nodes.has(subject.value)) nodes.set(subject.value, new Map());
        const properties = nodes.get(subject.value);
        if (!properties.has(predicate.value)) properties.set(predicate.value, []);
        properties.get(predicate.value).push(object);
    }
    const values = (id, property) => nodes.get(id)?.get(property) ?? [];
    const refs = (id, property) => values(id, property).filter(term => term.termType === 'NamedNode').map(term => term.value);
    const one = (id, property) => {
        const terms = values(id, property);
        if (terms.length > 1) throw new Error(`${id}: meerdere waarden voor ${property}.`);
        return terms[0]?.value;
    };
    const cls = id => one(id, 'http://www.w3.org/ns/shacl#class');
    const relation = id => one(id, DCT + 'relation');
    const numeric = id => numericTypes.has(one(id, VOCAB + 'relevantDataType')) &&
        !refs(id, VOCAB + 'relevantCodeList').length && !refs(id, VOCAB + 'relevantRiepr').length;
    const required = id => ['true', '1'].includes(one(id, VOCAB + 'isVerplicht')) &&
        !values(id, 'http://www.w3.org/ns/shacl#path').length;
    const active = id => !refs(id, 'http://www.w3.org/ns/adms#status').some(status => /[/#]Withdrawn$/.test(status));
    const ids = [...nodes.keys()].filter(active).sort();
    const parents = new Map(ids.map(id => [id, one(id, 'http://purl.org/iso25964/skos-thes#broaderPartitive')]));
    const belongsTo = (id, target) => {
        const seen = new Set([id]);
        let parent = parents.get(id);
        while (parent) {
            if (seen.has(parent)) throw new Error(`${id}: cyclische resultaateigendom.`);
            if (parent === target) return true;
            seen.add(parent);
            parent = parents.get(parent);
        }
        return false;
    };
    // relevantObservation may redirect ownership, but an ancestor collection does
    // not pull fields out of their more specific, source-owned child object.
    const owners = new Map(ids.map(id => {
        const targets = refs(id, VOCAB + 'relevantObservation');
        return [id, targets.length ? targets.map(target => belongsTo(id, target) ? parents.get(id) : target) : [parents.get(id)]];
    }));
    const children = id => ids.filter(child => owners.get(child).includes(id));
    const shapes = [];
    for (const id of ids) {
        if (cls(id) === RIEPR + 'Resultaat') {
            shapes.push({ id, fields: children(id), observation: parents.get(id), scalar: false });
        } else if (cls(id) === RIEPR + 'Observatie') {
            const fields = children(id);
            if (fields.some(child => relation(child) === SOSA + 'hasResult')) continue;
            const components = fields.filter(child => !relation(child)?.startsWith(SOSA) &&
                !(refs(child, VOCAB + 'relevantRiepr').length && cls(child) === SOSA + 'FeatureOfInterest'));
            if (numeric(id) || components.length) {
                shapes.push({ id, fields: components, observation: id, scalar: numeric(id) });
            }
        }
    }

    const expandList = (id, visiting = new Set()) => {
        if (visiting.has(id)) throw new Error(`${id}: cyclische codelijst.`);
        const types = refs(id, RDF + 'type');
        if (types.includes(SKOS + 'Collection')) {
            const next = new Set([...visiting, id]);
            const members = refs(id, SKOS + 'member');
            if (!members.length) throw new Error(`${id}: lege codelijst.`);
            return members.flatMap(member => refs(member, RDF + 'type').includes(SKOS + 'Collection')
                ? expandList(member, next) : [member]);
        }
        if (types.includes(SKOS + 'ConceptScheme')) {
            const members = ids.filter(member => refs(member, SKOS + 'inScheme').includes(id));
            if (!members.length) throw new Error(`${id}: codelijst zonder concepten.`);
            return members;
        }
        throw new Error(`${id}: codelijst ontbreekt in de gegenereerde bron.`);
    };
    const properties = new Map();
    const documents = shapes.map(shape => {
        if (!shape.id.startsWith(CONCEPT)) throw new Error(`${shape.id}: geen publiceerbare concept-IRI voor een DSD.`);
        const components = new Map();
        const component = (predicate, role, field, options = {}) => {
            const previous = components.get(predicate);
            if (previous && previous.role !== role) throw new Error(`${shape.id}: conflicterende QB-rollen voor ${predicate}.`);
            const item = previous ?? { predicate, role, fields: new Set(), required: false };
            item.fields.add(field);
            item.required ||= options.required ?? required(field);
            components.set(predicate, item);
            if (!properties.has(predicate)) {
                properties.set(predicate, { roles: new Set(), ranges: new Set(), codes: new Set(), lists: new Set(), uncoded: false });
            }
            const property = properties.get(predicate);
            property.roles.add(role);
            property.uncoded ||= !options.codes?.length && !options.lists?.length;
            if (options.range) property.ranges.add(options.range);
            for (const code of options.codes ?? []) property.codes.add(code);
            for (const list of options.lists ?? []) {
                property.lists.add(list);
                for (const code of expandList(list)) property.codes.add(code);
            }
        };
        const qualifiers = field => {
            for (const predicate of dimensions) {
                if (predicate === VOCAB + 'variabele') {
                    for (const selector of refs(field, predicate)) {
                        const lists = refs(selector, VOCAB + 'relevantCodeList');
                        if (!lists.length) throw new Error(`${field}: variabelebron ${selector} heeft geen codelijst.`);
                        component(predicate, 'dimension', selector, { lists });
                    }
                } else {
                    const codes = refs(field, predicate);
                    if (codes.length) component(predicate, 'dimension', field, { codes });
                }
            }
        };
        const numericFields = shape.fields.filter(field => numeric(field) && !relation(field));
        const implicitMeasure = !shape.fields.some(field => relation(field) === QUDT + 'numericValue') &&
            numericFields.length === 1 ? numericFields[0] : undefined;
        const addField = (field, predicate) => {
            if (!predicate) throw new Error(`${field}: resultaatkenmerk zonder RDF-predicaat.`);
            const role = cubeRoles.get(predicate) ?? 'attribute';
            if (role === 'measure' && !numeric(field)) {
                throw new Error(`${field}: numerieke meetwaarde zonder numeriek datatype.`);
            }
            const lists = refs(field, VOCAB + 'relevantCodeList');
            const units = refs(field, QUDT + 'relevantUnit');
            const nestedQuantity = units.length && predicate !== QUDT + 'numericValue' && predicate !== QUDT + 'hasUnit';
            component(predicate, role, field, {
                lists,
                range: nestedQuantity ? QUDT + 'QuantityValue'
                    : role === 'measure' ? one(field, VOCAB + 'relevantDataType')
                        : cls(field) ?? one(field, VOCAB + 'relevantDataType'),
            });
            if (predicate === QUDT + 'numericValue' && units.length) {
                const unitLists = units.filter(unit => refs(unit, RDF + 'type').includes(SKOS + 'Collection'));
                component(QUDT + 'hasUnit', 'attribute', field, {
                    required: shape.scalar || required(field), lists: unitLists,
                    codes: units.filter(unit => !unitLists.includes(unit)),
                });
            }
            qualifiers(field);
        };
        if (shape.scalar) addField(shape.id, QUDT + 'numericValue');
        for (const field of shape.fields) addField(field, field === implicitMeasure ? QUDT + 'numericValue' : relation(field));
        qualifiers(shape.id);
        if (shape.observation && shape.observation !== shape.id) qualifiers(shape.observation);
        if (![...components.values()].some(item => item.role === 'measure')) {
            throw new Error(`${shape.id}: Resultaat zonder numerieke meetwaarde; geen DSD gegenereerd.`);
        }
        for (const property of cubeProfile.properties.filter(property => property.path)) {
            component(property.predicate, property.role, property.predicate, {
                range: property.range, required: property.role !== 'attribute',
            });
        }
        return {
            id: resultDsd(shape.id),
            relativePath: shape.id.slice(CONCEPT.length) + '.ttl',
            source: shape.id,
            components: [...components.values()],
        };
    });

    // QB property declarations are global RDF statements, not scoped to a DSD.
    // Use one union domain per predicate, so merging separate files cannot turn
    // the same predicate into incompatible coded properties.
    for (const document of documents) {
        const graph = rdf.dataset();
        const add = (subject, predicate, object) => graph.add(rdf.quad(rdf.namedNode(subject), rdf.namedNode(predicate), object));
        const link = (subject, predicate, object) => add(subject, predicate, rdf.namedNode(object));
        const type = (subject, object) => link(subject, RDF + 'type', object);
        type(document.id, QB + 'DataStructureDefinition');
        link(document.id, DCT + 'source', document.source);
        for (const label of values(document.source, SKOS + 'prefLabel')) add(document.id, RDFS + 'label', label);
        for (const definition of values(document.source, SKOS + 'definition')) add(document.id, DCT + 'description', definition);
        const roleOrder = { dimension: 0, measure: 1, attribute: 2 };
        const sorted = document.components.sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.predicate.localeCompare(b.predicate));
        let order = 0;
        for (const item of sorted) {
            const id = document.id + '#component-' + encodeURIComponent(item.predicate);
            type(id, QB + 'ComponentSpecification');
            link(document.id, QB + 'component', id);
            link(id, QB + item.role, item.predicate);
            for (const field of [...item.fields].sort()) {
                link(id, DCT + 'source', field);
                const context = cubeProfile.properties.find(property => property.predicate === field && property.path);
                if (context?.label) add(id, RDFS + 'label', rdf.literal(context.label, 'nl'));
                if (relation(field) === item.predicate || item.role === 'measure') {
                    for (const label of values(field, SKOS + 'prefLabel')) add(id, RDFS + 'label', label);
                }
            }
            if (item.role === 'dimension') add(id, QB + 'order', rdf.literal(String(++order), rdf.namedNode(XSD + 'integer')));
            if (item.role === 'attribute') {
                link(id, QB + 'componentAttachment', QB + 'Observation');
                add(id, QB + 'componentRequired', rdf.literal(String(item.required), rdf.namedNode(XSD + 'boolean')));
            }
            const property = properties.get(item.predicate);
            type(item.predicate, RDF + 'Property');
            for (const role of [...property.roles].sort()) type(item.predicate, QB + role[0].toUpperCase() + role.slice(1) + 'Property');
            if (property.codes.size && !property.uncoded) {
                const [sourceList] = property.lists;
                const directList = property.lists.size === 1 && new Set(expandList(sourceList)).size === property.codes.size;
                const codeList = directList ? sourceList : DSD + 'riepr/codelijsten/' + encodeURIComponent(item.predicate);
                type(item.predicate, QB + 'CodedProperty');
                link(item.predicate, RDFS + 'range', SKOS + 'Concept');
                link(item.predicate, QB + 'codeList', codeList);
                if (!directList) {
                    type(codeList, SKOS + 'Collection');
                    for (const list of [...property.lists].sort()) link(codeList, DCT + 'source', list);
                    for (const code of [...property.codes].sort()) {
                        link(codeList, SKOS + 'member', code);
                    }
                }
            } else if (property.ranges.size || property.codes.size) {
                const ranges = [...property.ranges];
                // Multiple rdfs:range statements mean intersection, not alternatives.
                const range = property.codes.size ? RDFS + 'Resource'
                    : ranges.length === 1 ? ranges[0]
                    : ranges.every(value => [XSD + 'decimal', XSD + 'integer'].includes(value)) ? XSD + 'decimal'
                        : ranges.every(value => numericTypes.has(value)) ? RDFS + 'Literal' : RDFS + 'Resource';
                link(item.predicate, RDFS + 'range', range);
            }
        }
        document.graph = graph;
        delete document.components;
    }
    return documents;
}
