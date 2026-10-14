// Read-only questions about the systeemtypes and their eigenschappen, e.g.
// "Welke typen installaties bestaan er?" or "Wat zijn de eigenschappen van een fakkel?".

import type { CsvRecord } from './csv.js';
import { isOperationalFile, Repo, THEMA_FILE } from './flows.js';
import { describeList, type InlineList } from './lists.js';
import { openCsv, splitValues, SYSTEMS, systemNames, type System, type SystemNames } from './repo.js';
import { LIST_TYPES, ValidationError } from './rules.js';

interface SystemModel {
    names: SystemNames;
    types: CsvRecord[];
    properties: CsvRecord[];
    lists: Map<string, InlineList>;
}

interface Candidate {
    model: SystemModel;
    record: CsvRecord;
}

/** Lowercase without diacritics, so "geinstalleerd" matches "geïnstalleerd". */
function normalize(text: string | undefined): string {
    return (text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

function loadSystem(system: System): SystemModel {
    const names = systemNames(system);
    const types = openCsv(names.typeFile).records.filter(r => r._type === 'skos:Concept');
    const propertyCsv = openCsv(names.propertyFile);
    const records = propertyCsv.records;
    const properties = records.filter(r => r.inScheme === names.propertyScheme && r._type === 'skos:Concept');
    const lists = new Map<string, InlineList>();
    for (const r of records.filter(r => LIST_TYPES.includes(r._type) && r._id !== names.propertyScheme)) {
        const list = describeList(propertyCsv, r._id);
        if (list) lists.set(r._id, list);
    }
    return { names, types, properties, lists };
}

function ancestors(types: CsvRecord[], id: string): string[] {
    const chain: string[] = [];
    let current = types.find(t => t._id === id);
    while (current?.broader && !chain.includes(current.broader)) {
        const broader: string = current.broader;
        chain.push(broader);
        current = types.find(t => t._id === broader);
    }
    return chain;
}

function descendants(types: CsvRecord[], id: string): string[] {
    const result: string[] = [];
    for (const child of types.filter(t => t.broader === id)) result.push(child._id, ...descendants(types, child._id));
    return result;
}

function describeType(model: SystemModel, record: CsvRecord) {
    const label = (id: string) => model.types.find(t => t._id === id)?.prefLabel;
    return {
        id: record._id,
        system: model.names.system,
        prefLabel: record.prefLabel,
        altLabel: record.altLabel || undefined,
        definition: record.definition || undefined,
        broader: ancestors(model.types, record._id).map(id => ({ id, prefLabel: label(id) })),
        subtypes: descendants(model.types, record._id).map(id => ({ id, prefLabel: label(id) })),
        isOnzichtbaar: record.isOnzichtbaar === 'true' || undefined,
    };
}

function describeCodeList(model: SystemModel, id: string): CodeListDescription {
    const local = model.lists.get(id);
    return local
        ? { ...local, definedIn: `src/source/${model.names.propertyFile}` }
        : { id, definedIn: 'published elsewhere (not in this eigenschappen CSV)' };
}

type CodeListDescription = (InlineList & { definedIn: string }) | { id: string; definedIn: string };

export interface PropertyDescription {
    id: string;
    prefLabel: string;
    definition?: string;
    /** Why the property applies to the requested type. */
    appliesVia?: string;
    /** Subtypes a property applies to, when it does not apply to the type itself. */
    onlyFor?: string[];
    datatype?: string;
    unit: Array<string | CodeListDescription>;
    codeList: CodeListDescription[];
    relation?: string;
    relevantProperty?: string;
    isVerplicht?: true;
    isMeervoudig?: true;
    isMultiselect?: true;
    composite?: true;
    parts?: PropertyDescription[];
}

function describeProperty(
    model: SystemModel,
    record: CsvRecord,
    extra: Pick<PropertyDescription, 'appliesVia' | 'onlyFor'> = {},
): PropertyDescription {
    const parts = model.properties.filter(p => p.broaderPartitive === record._id);
    return {
        id: record._id,
        prefLabel: record.prefLabel,
        definition: record.definition || undefined,
        ...extra,
        datatype: record.relevantDataType || undefined,
        unit: splitValues(record.relevantUnit).map(u => (model.lists.has(u) ? describeCodeList(model, u) : u)),
        codeList: splitValues(record.relevantCodeList).map(c => describeCodeList(model, c)),
        relation: record.relation || undefined,
        relevantProperty: record.relevantProperty || undefined,
        isVerplicht: record.isVerplicht === 'true' || undefined,
        isMeervoudig: record.isMeervoudig === 'true' || undefined,
        isMultiselect: record.isMultiselect === 'true' || undefined,
        composite: parts.length > 0 || undefined,
        parts: parts.length > 0 ? parts.map(p => describeProperty(model, p)) : undefined,
    };
}

/** Resolves "fakkel", "Fakkel", "emissiepunt:fakkel" or "Directe Stookinstallatie" to one candidate. */
function resolve(candidates: Candidate[], query: string, what: 'type' | 'property'): Candidate {
    const q = normalize(query);
    const code = (c: Candidate) => normalize(c.record._id.split(':')[1]);
    const tiers: Array<(c: Candidate) => boolean> = [
        c => normalize(c.record._id) === q,
        c => code(c) === q,
        c => normalize(c.record.prefLabel) === q || normalize(c.record.altLabel) === q,
        c => normalize(c.record.prefLabel).includes(q) || code(c).includes(q.replace(/\s+/g, '_')),
    ];
    for (const tier of tiers) {
        const found = candidates.filter(tier);
        if (found.length === 1) return found[0];
        if (found.length > 1) {
            const plural = what === 'property' ? 'properties' : 'types';
            throw new ValidationError(`'${query}' matches several ${plural}, ask the user which one (or pass system): ${found.map(f => `${f.record._id} (${f.record.prefLabel})`).join(', ')}`);
        }
    }
    throw new ValidationError(`No ${what} matches '${query}'. Use search_codelists to look for similar names.`);
}

function models(system?: System): SystemModel[] {
    return (system ? [system] : SYSTEMS).map(loadSystem);
}

export function getTypeProperties({ type, system }: { type: string; system?: System }) {
    const { model, record } = resolve(
        models(system).flatMap(model => model.types.map(record => ({ model, record }))), type, 'type',
    );
    const chain = ancestors(model.types, record._id);
    const label = (id: string) => model.types.find(t => t._id === id)?.prefLabel;
    const via = (targets: string[]) => {
        if (targets.includes(record._id)) return { appliesVia: 'direct' };
        const inherited = chain.find(a => targets.includes(a));
        if (inherited) return { appliesVia: `inherited from ${inherited} (${label(inherited)})` };
        if (targets.includes(model.names.typeScheme)) return { appliesVia: `all ${model.names.system} types` };
        return undefined;
    };

    const properties: PropertyDescription[] = [];
    const subtypeProperties: PropertyDescription[] = [];
    const subtypes = descendants(model.types, record._id);
    for (const property of model.properties.filter(p => !p.broaderPartitive)) {
        const parts = model.properties.filter(p => p.broaderPartitive === property._id);
        // Composites carry relevantRiepr on the parent or (older entries) on their parts.
        const targets = [property, ...parts].flatMap(p => splitValues(p.relevantRiepr));
        const match = via(targets);
        if (match) properties.push(describeProperty(model, property, match));
        else {
            const forSubtypes = subtypes.filter(s => targets.includes(s));
            if (forSubtypes.length) subtypeProperties.push(describeProperty(model, property, { onlyFor: forSubtypes.map(s => `${s} (${label(s)})`) }));
        }
    }
    return {
        type: describeType(model, record),
        properties,
        subtypeProperties: subtypeProperties.length ? subtypeProperties : undefined,
        note: properties.length === 0 ? `No eigenschappen are defined for ${record._id} yet.` : undefined,
    };
}

export function getProperty({ property, system }: { property: string; system?: System }) {
    const { model, record } = resolve(
        models(system).flatMap(model => model.properties.map(record => ({ model, record }))), property, 'property',
    );
    const parent = model.properties.find(p => p._id === record.broaderPartitive);
    const owner = parent ?? record;
    const parts = model.properties.filter(p => p.broaderPartitive === owner._id);
    const targets = [owner, ...parts].flatMap(p => splitValues(p.relevantRiepr));
    const label = (id: string) => model.types.find(t => t._id === id)?.prefLabel;
    const appliesTo = targets.includes(model.names.typeScheme)
        ? model.types.map(t => ({ id: t._id, prefLabel: t.prefLabel, via: `all ${model.names.system} types` }))
        : [...new Set(targets)].flatMap(t => [
            { id: t, prefLabel: label(t), via: 'direct' },
            ...descendants(model.types, t).map(d => ({ id: d, prefLabel: label(d), via: `subtype of ${t}` })),
        ]);
    return {
        system: model.names.system,
        ...describeProperty(model, record),
        partOf: parent ? { id: parent._id, prefLabel: parent.prefLabel } : undefined,
        appliesTo,
    };
}

export type SearchKind = 'all' | 'type' | 'property' | 'option' | 'operational';

export function searchCodelists({ query, system, kind = 'all' }: { query: string; system?: System; kind?: SearchKind }) {
    const q = normalize(query);
    const score = (record: CsvRecord) => {
        const label = normalize(record.prefLabel);
        const code = normalize(record._id.split(':')[1]);
        if (label === q || code === q) return 3;
        if (label.startsWith(q) || code.startsWith(q)) return 2;
        if (label.includes(q) || code.includes(q) || normalize(record.altLabel).includes(q)) return 1;
        if (normalize(record.definition).includes(q)) return 0.5;
        return 0;
    };
    const hits: Array<{ score: number; kind: SearchKind; [key: string]: unknown }> = [];
    for (const model of models(system)) {
        const add = (k: SearchKind, record: CsvRecord, details: Record<string, unknown>) => {
            const s = score(record);
            if (s > 0) {
                hits.push({
                    score: s, kind: k, system: model.names.system, id: record._id,
                    prefLabel: record.prefLabel || undefined, definition: record.definition || undefined, ...details,
                });
            }
        };
        if (kind === 'all' || kind === 'type') {
            model.types.forEach(r => add('type', r, { broader: r.broader || undefined }));
        }
        if (kind === 'all' || kind === 'property') {
            model.properties.forEach(r => add('property', r, { partOf: r.broaderPartitive || undefined, appliesTo: splitValues(r.relevantRiepr) }));
        }
        if (kind === 'all' || kind === 'option') {
            for (const list of model.lists.values()) {
                for (const m of list.members.filter(m => m.prefLabel)) {
                    add('option', { _id: m.id, prefLabel: m.prefLabel ?? '', definition: m.definition ?? '' }, { list: list.id });
                }
            }
        }
    }
    if (!system && (kind === 'all' || kind === 'operational')) {
        for (const at of new Repo().rows.filter(r => isOperationalFile(r.file) && r.record._type)) {
            const s = score(at.record);
            if (s > 0) {
                hits.push({
                    score: s, kind: 'operational', id: at.record._id, prefLabel: at.record.prefLabel || undefined,
                    definition: at.record.definition || undefined,
                    what: at.file === THEMA_FILE ? 'thema' : at.record._type === 'skos:ConceptScheme' ? 'step or option list' : 'field or option',
                    step: at.record.inScheme || undefined, file: `src/source/${at.file}`,
                });
            }
        }
    }
    hits.sort((a, b) => b.score - a.score);
    return { query, results: hits.slice(0, 50).map(({ score, ...hit }) => hit) };
}
