// Selection lists used through relevantCodeList / relevantUnit: inline concept
// schemes and collections in <systeem>_eigenschappen.csv, and lookups of
// lists published elsewhere.

import type { CsvFile, CsvInput, CsvRecord, CsvRow } from './csv.js';
import {
    conceptRow, describeReferences, findReferences, merge, newProblems, type LineChange,
} from './references.js';
import {
    conceptIndex, declarePrefix, isDeclaredPrefix, openCsv, prefixOf, splitValues, systemNames, type SystemNames,
} from './repo.js';
import {
    checkCode, checkReference, checkTexts, fail, LIST_TYPES, toId, ValidationError, writeResult, type WriteResult,
} from './rules.js';
import { typeringProblems } from './typering.js';

export type ListKind = 'conceptscheme' | 'collection';

export interface ListMember {
    id: string;
    prefLabel?: string;
    definition?: string;
}

export interface InlineList {
    id: string;
    type: string;
    prefLabel?: string;
    definition?: string;
    members: ListMember[];
}

export interface OptionInput {
    code: string;
    prefLabel: string;
    definition: string;
}

/** An inline concept scheme or collection defined in `csv`, with its options/members. */
export function describeList(csv: CsvFile, id: string): InlineList | undefined {
    const rows = csv.records;
    const list = rows.find(r => r._id === id && LIST_TYPES.includes(r._type));
    if (!list) return undefined;
    const members = list._type === 'skos:ConceptScheme'
        ? rows.filter(r => r.inScheme === id).map(r => ({ id: r._id, prefLabel: r.prefLabel || undefined, definition: r.definition || undefined }))
        : rows.filter(r => splitValues(r.collections).includes(id)).map(r => ({ id: r._id }));
    return { id, type: list._type, prefLabel: list.prefLabel || undefined, definition: list.definition || undefined, members };
}

export function addSelectionList(params: {
    system: string;
    kind: ListKind;
    name: string;
    prefLabel?: string;
    definition?: string;
    concepts?: OptionInput[];
    members?: string[];
    extend?: boolean;
    dryRun?: boolean;
}): WriteResult {
    const { system, kind, name, prefLabel, definition, concepts = [], members = [], extend = false, dryRun = true } = params;
    const names = systemNames(system);
    const csv = openCsv(names.propertyFile);
    const index = conceptIndex();
    const errors: string[] = [];
    const warnings: string[] = [];
    const changes: string[] = [];

    const listPrefix = kind === 'conceptscheme' ? 'conceptscheme' : 'collectie';
    const listId = name.includes(':') ? name : `${listPrefix}:${kind === 'conceptscheme' ? `${system}_` : ''}${name}`;
    if (prefixOf(listId) !== listPrefix) errors.push(`A ${kind} id must use the '${listPrefix}:' prefix.`);
    else checkCode(listId.split(':')[1], 'name', errors);

    const existing = describeList(csv, listId);
    if (extend) {
        if (!existing) errors.push(`extend=true but ${listId} is not defined in ${names.propertyFile}.`);
        else if ((existing.type === 'skos:ConceptScheme') !== (kind === 'conceptscheme')) errors.push(`${listId} is a ${existing.type}, not a ${kind}.`);
    } else {
        const defined = index.get(listId);
        if (defined) errors.push(`${listId} already exists in ${defined[0].file}; pass extend=true to add entries to it.`);
        checkTexts({ prefLabel, definition }, errors, warnings);
    }

    const rows: CsvInput[] = [];
    if (kind === 'conceptscheme') {
        if (members.length) errors.push('members only apply to collections; give concepts for a conceptscheme.');
        if (concepts.length === 0) errors.push('A conceptscheme needs at least one concept ({code, prefLabel, definition}).');
        for (const concept of concepts) {
            checkCode(concept.code, 'concept code', errors);
            checkTexts({ prefLabel: concept.prefLabel, definition: concept.definition }, errors, warnings);
            const conceptId = `${names.selectionPrefix}:${concept.code}`;
            if (index.has(conceptId) || rows.some(r => r._id === conceptId)) errors.push(`${conceptId} already exists; selection concepts share one prefix per system, pick a more specific code.`);
            rows.push({
                _id: conceptId,
                _type: 'skos:Concept',
                topConceptOf: listId,
                inScheme: listId,
                prefLabel: concept.prefLabel?.trim(),
                definition: concept.definition?.trim(),
            });
        }
    } else {
        if (concepts.length) errors.push('concepts only apply to conceptschemes; give members (existing concept CURIEs/URLs) for a collection.');
        if (members.length === 0) errors.push('A collection needs at least one member (CURIE or URL of an existing, published concept).');
        for (const member of members) {
            checkReference(member, 'member', errors);
            if (existing?.members.some(m => m.id === member)) errors.push(`${member} is already a member of ${listId}.`);
        }
        if (csv.addColumn('collections')) changes.push(`${names.propertyFile}: added column collections`);
        rows.push(...members.map(member => ({ _id: member, collections: listId })));
    }
    if (kind === 'conceptscheme') {
        // Options that are kinds of the system belong in <systeem>_type.csv as subtypes.
        const typering = typeringProblems(names, {
            id: listId, prefLabel: prefLabel ?? existing?.prefLabel, code: listId.split(':')[1].replace(new RegExp(`^${system}_`), ''),
            appliesTo: [], hasCodeList: true, options: concepts,
        });
        errors.push(...typering.errors);
    }
    fail(errors);

    if (kind === 'conceptscheme' && !isDeclaredPrefix(names.selectionPrefix)) {
        const declaration = { prefix: names.selectionPrefix, uri: names.selectionPrefixUri, after: names.propertyPrefix };
        if (dryRun) changes.push(`would declare prefix ${declaration.prefix}: ${declaration.uri} in config.yml and README.md`);
        else changes.push(...declarePrefix(declaration));
    }

    let lines: string[];
    if (extend) {
        let after = 0;
        for (const row of csv.rows) {
            const r = row.record;
            if (r._id === listId || r.inScheme === listId || splitValues(r.collections).includes(listId)) after = row.index;
        }
        lines = csv.insertAfter(after, rows);
    } else {
        const listRow: CsvInput = {
            _id: listId,
            _type: kind === 'conceptscheme' ? 'skos:ConceptScheme' : 'skos:Collection',
            prefLabel: prefLabel?.trim(),
            definition: definition?.trim(),
        };
        lines = csv.appendBlock([listRow, ...rows]);
    }
    if (!dryRun) csv.save();
    return writeResult({
        action: `${extend ? 'extend' : 'add'} ${kind} ${listId}`,
        file: `src/source/${names.propertyFile}`,
        insertedLines: lines,
        otherChanges: changes,
        warnings,
        dryRun,
        codeListId: listId,
        use: kind === 'collection' && members.every(m => /eenheid/.test(m))
            ? `Reference it from add_property with unit=['${listId}'].`
            : `Reference it from add_property with codeList=['${listId}'] and codeListSource='inline'.`,
    });
}

// ---------------------------------------------------------------------------
// Editing and deleting inline lists
// ---------------------------------------------------------------------------

/** Rows that belong to a list itself rather than referring to it. */
export function isOwnListRow(record: CsvRecord, column: string, listId: string): boolean {
    return (['inScheme', 'topConceptOf'].includes(column) && record.inScheme === listId) || column === 'collections';
}

function resolveList(csv: CsvFile, names: SystemNames, list: string): InlineList {
    const candidates = list.includes(':')
        ? [list]
        : [`conceptscheme:${list}`, `conceptscheme:${names.system}_${list}`, `collectie:${list}`];
    const found = candidates.map(c => describeList(csv, c)).find(Boolean);
    if (!found || found.id === names.propertyScheme) {
        throw new ValidationError(`'${list}' is not an inline concept scheme or collection in ${names.propertyFile} (published lists cannot be changed from here).`);
    }
    return found;
}

interface MembershipEdit {
    row: CsvRow;
    collections: string[];
}

/**
 * Lines to remove for a list (its row, its options, membership rows that only
 * belong to it) and membership rows that also belong to other collections.
 */
export function listRowIndexes(csv: CsvFile, listId: string): { remove: number[]; edit: MembershipEdit[] } {
    const remove: number[] = [];
    const edit: MembershipEdit[] = [];
    for (const row of csv.rows.filter(r => !r.blank)) {
        const r = row.record;
        if ((r._id === listId && r._type) || r.inScheme === listId) remove.push(row.index);
        else if (splitValues(r.collections).includes(listId)) {
            const remaining = splitValues(r.collections).filter(c => c !== listId);
            if (remaining.length === 0 && !r._type) remove.push(row.index);
            else edit.push({ row, collections: remaining });
        }
    }
    return { remove, edit };
}

export function applyMembershipEdits(csv: CsvFile, names: SystemNames, edits: MembershipEdit[]): LineChange[] {
    return edits.map(({ row, collections }) => {
        const before = csv.lines[row.index];
        const after = csv.replaceLine(row.index, { ...row.record, collections: collections.join('|') });
        return { file: `src/source/${names.propertyFile}`, line: row.index + 1, before, after };
    });
}

interface TextFields {
    prefLabel?: string;
    definition?: string;
}

export function updateSelectionList(params: {
    system: string;
    list: string;
    set?: { prefLabel?: string; definition?: string | null };
    options?: Array<{ option: string; prefLabel?: string; definition?: string | null }>;
    dryRun?: boolean;
}): WriteResult {
    const { system, list, set = {}, options = [], dryRun = true } = params;
    const names = systemNames(system);
    const csv = openCsv(names.propertyFile);
    const found = resolveList(csv, names, list);
    const errors: string[] = [];
    const warnings: string[] = [];
    const changes: LineChange[] = [];

    const edit = (row: CsvRow, fields: { prefLabel?: string; definition?: string | null }) => {
        const current: TextFields = { prefLabel: row.record.prefLabel, definition: row.record.definition || undefined };
        const merged = merge(current, fields);
        const before = { errors: [] as string[], warnings: [] as string[] };
        checkTexts({ prefLabel: current.prefLabel, definition: current.definition ?? '' }, before.errors, before.warnings);
        const after = { errors: [] as string[], warnings: [] as string[] };
        checkTexts({ prefLabel: merged.prefLabel, definition: merged.definition ?? '' }, after.errors, after.warnings);
        const problems = newProblems(before, after);
        errors.push(...problems.errors.map(e => `${row.record._id}: ${e}`));
        warnings.push(...problems.warnings.map(w => `${row.record._id}: ${w}`));
        const oldLine = csv.lines[row.index];
        const newLine = csv.replaceLine(row.index, { ...row.record, prefLabel: merged.prefLabel?.trim(), definition: merged.definition?.trim() });
        if (newLine !== oldLine) changes.push({ file: `src/source/${names.propertyFile}`, line: row.index + 1, before: oldLine, after: newLine });
    };

    const listRow = conceptRow(csv, found.id);
    if (listRow && (set.prefLabel !== undefined || set.definition !== undefined)) edit(listRow, set);
    for (const option of options) {
        if (found.type !== 'skos:ConceptScheme') {
            errors.push(`${found.id} is a collection of published concepts; its members cannot be edited here, only added or removed.`);
            break;
        }
        const optionId = toId(option.option, names.selectionPrefix);
        const row = conceptRow(csv, optionId);
        if (!row || row.record.inScheme !== found.id) errors.push(`${optionId} is not an option of ${found.id}.`);
        else edit(row, { prefLabel: option.prefLabel, definition: option.definition });
    }
    fail(errors);
    if (changes.length === 0) throw new ValidationError(`Nothing changes for ${found.id}.`);
    if (!dryRun) csv.save();
    return writeResult({ action: `update ${found.id}`, changes, warnings, dryRun });
}

export function removeListEntries(
    { system, list, entries, dryRun = true }: { system: string; list: string; entries: string[]; dryRun?: boolean },
): WriteResult {
    const names = systemNames(system);
    const csv = openCsv(names.propertyFile);
    const found = resolveList(csv, names, list);
    const isScheme = found.type === 'skos:ConceptScheme';
    const ids = entries.map(e => (isScheme ? toId(e, names.selectionPrefix) : e));
    const errors: string[] = [];
    for (const entry of ids) {
        if (!found.members.some(m => m.id === entry)) errors.push(`${entry} is not ${isScheme ? 'an option' : 'a member'} of ${found.id}.`);
    }
    if (ids.length >= found.members.length) errors.push(`This would leave ${found.id} empty; use delete_selection_list instead.`);
    if (isScheme) {
        const references = findReferences(ids, { ignore: ({ row }) => row.record.inScheme === found.id && ids.includes(row.record._id) });
        if (references.length) errors.push(`Options are still referenced; change these rows first:\n${describeReferences(references)}`);
    }
    fail(errors);

    const remove: number[] = [];
    const edits: MembershipEdit[] = [];
    for (const row of csv.rows.filter(r => !r.blank && ids.includes(r.record._id))) {
        if (isScheme && row.record.inScheme === found.id) remove.push(row.index);
        if (!isScheme && splitValues(row.record.collections).includes(found.id)) {
            const remaining = splitValues(row.record.collections).filter(c => c !== found.id);
            if (remaining.length === 0 && !row.record._type) remove.push(row.index);
            else edits.push({ row, collections: remaining });
        }
    }
    const changes = applyMembershipEdits(csv, names, edits);
    changes.push({ file: `src/source/${names.propertyFile}`, removed: csv.removeLines(remove) });
    if (!dryRun) csv.save();
    return writeResult({ action: `remove ${ids.length} entr${ids.length === 1 ? 'y' : 'ies'} from ${found.id}`, changes, dryRun });
}

export function deleteSelectionList({ system, list, dryRun = true }: { system: string; list: string; dryRun?: boolean }): WriteResult {
    const names = systemNames(system);
    const csv = openCsv(names.propertyFile);
    const found = resolveList(csv, names, list);
    const optionIds = found.type === 'skos:ConceptScheme' ? found.members.map(m => m.id) : [];
    const references = findReferences([found.id, ...optionIds], {
        ignore: ({ file, row, column, id }) => file === names.propertyFile
            && (isOwnListRow(row.record, column, found.id) || (id !== found.id && row.record.inScheme === found.id)),
    });
    fail(references.length ? [`${found.id} is still used; update or delete these first:\n${describeReferences(references)}`] : []);

    const { remove, edit } = listRowIndexes(csv, found.id);
    const changes = applyMembershipEdits(csv, names, edit);
    changes.push({ file: `src/source/${names.propertyFile}`, removed: csv.removeLines(remove) });
    if (!dryRun) csv.save();
    return writeResult({ action: `delete ${found.id}`, changes, dryRun });
}

// ---------------------------------------------------------------------------
// Discovering existing code lists
// ---------------------------------------------------------------------------

const SPARQL_ENDPOINT = 'https://data.omgeving.vlaanderen.be/sparql';

interface SparqlResults {
    results: { bindings: Array<Record<string, { value: string }>> };
}

async function searchPublishedSchemes(query: string) {
    const escaped = query.toLowerCase().replace(/["\\]/g, '');
    const sparql = `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT DISTINCT ?scheme ?label WHERE {
  { ?scheme a skos:ConceptScheme } UNION { ?scheme a skos:Collection }
  ?scheme skos:prefLabel ?label .
  FILTER(CONTAINS(LCASE(STR(?label)), "${escaped}"))
} LIMIT 50`;
    const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(sparql)}`;
    const response = await fetch(url, {
        headers: { Accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`SPARQL endpoint answered ${response.status}`);
    const json = (await response.json()) as SparqlResults;
    return json.results.bindings.map(b => ({ uri: b.scheme.value, prefLabel: b.label.value }));
}

export async function findCodeLists({ query, searchPublished = false }: { query?: string; searchPublished?: boolean }) {
    const matches = (text: string | undefined) => !query || (text ?? '').toLowerCase().includes(query.toLowerCase());
    const index = conceptIndex();
    const definedInRepo: Array<{ id: string; type: string; prefLabel?: string; file: string }> = [];
    for (const [id, entries] of index) {
        for (const entry of entries) {
            if (LIST_TYPES.includes(entry.type) && (matches(id) || matches(entry.prefLabel))) {
                definedInRepo.push({ id, type: entry.type, prefLabel: entry.prefLabel || undefined, file: `src/source/${entry.file}` });
            }
        }
    }
    const referencedExternally = new Map<string, { id: string; column: string; usedIn: Set<string> }>();
    for (const entries of index.values()) {
        for (const { record, file } of entries) {
            for (const column of ['relevantCodeList', 'relevantUnit']) {
                for (const value of splitValues(record[column])) {
                    if (!index.has(value) && matches(value)) {
                        const entry = referencedExternally.get(value) ?? { id: value, column, usedIn: new Set<string>() };
                        entry.usedIn.add(file);
                        referencedExternally.set(value, entry);
                    }
                }
            }
        }
    }
    let published: unknown;
    if (searchPublished) {
        if (!query) published = { error: 'searchPublished needs a query.' };
        else {
            try {
                published = { endpoint: SPARQL_ENDPOINT, results: await searchPublishedSchemes(query) };
            } catch (error) {
                published = { endpoint: SPARQL_ENDPOINT, error: error instanceof Error ? error.message : String(error) };
            }
        }
    }
    return {
        definedInRepo,
        referencedExternally: [...referencedExternally.values()].map(v => ({ ...v, usedIn: [...v.usedIn] })),
        published,
        note: 'Lists defined in another source CSV are part of this release and count as published for an eigenschappen file. Lists that only appear under referencedExternally live outside this repo (e.g. CSOR).',
    };
}
