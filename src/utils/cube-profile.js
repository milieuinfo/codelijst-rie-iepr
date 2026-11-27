import profile from '../generated/cube-profile.json' with { type: 'json' };

const CONCEPT = 'https://data.omgeving.vlaanderen.be/id/concept/';
const DSD = 'https://data.omgeving.vlaanderen.be/id/dsd/';
const RIEPR = 'https://data.riepr.omgeving.vlaanderen.be/ns/riepr#';
const DCT = 'http://purl.org/dc/terms/';
const QB = 'http://purl.org/linked-data/cube#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

export const cubeProfile = profile;
export const cubeRoles = new Map(profile.properties.map(property => [property.predicate, property.role]));

export function resultDsd(source) {
    if (typeof source !== 'string' || !source.startsWith(CONCEPT) || source.length === CONCEPT.length || /[?#]/.test(source)) {
        throw new Error(`Geen publiceerbaar bronconcept voor een DSD: ${source}.`);
    }
    return DSD + source.slice(CONCEPT.length);
}

export function resultDataset(dsd, context) {
    if (typeof context.report !== 'string' || !context.report) throw new Error('Een expliciete bronrapport-IRI is verplicht voor RDF Cube-export.');
    for (const value of [context.report, dsd]) {
        try { new URL(value); } catch { throw new Error(`Ongeldige rapport- of DSD-IRI: ${value}.`); }
    }
    if (!Number.isInteger(context.year) || context.year < 1 || context.year > 9998) throw new Error('Ongeldig verslagjaar.');
    const instant = value => {
        if (typeof value !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) {
            throw new Error(`Ongeldige rapportversiedatum: ${value}.`);
        }
        return { value: new Date(value).toISOString(), datatype: XSD + 'dateTime' };
    };
    const values = {
        [DCT + 'source']: { value: context.report },
        [QB + 'structure']: { value: dsd },
        [RIEPR + 'productiejaar']: { value: String(context.year).padStart(4, '0'), datatype: XSD + 'gYear' },
        [DCT + 'created']: instant(context.created),
        [DCT + 'issued']: instant(context.issued),
    };
    const id = profile.dataset.template.replace(/\{([a-z]+)\}/g, (_match, variable) => {
        const value = values[profile.dataset.mappings[variable]];
        if (!value) throw new Error(`Geen datasetwaarde voor ${variable}.`);
        return encodeURIComponent(value.value);
    });
    return { id, className: profile.dataset.className, values };
}
