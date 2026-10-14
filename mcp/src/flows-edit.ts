// Adding, editing and deleting operationele flows, steps and fields.
// See flows.ts for the meaning of the columns.

import fs from 'node:fs';
import path from 'node:path';
import { escapeCsvField, type CsvFile, type CsvInput, type CsvRecord } from './csv.js';
import { isOperationalFile, OPERATIONAL_DATATYPES, Repo, THEMA_FILE, THEMA_SCHEME, uiOrder, type Located } from './flows.js';
import { describeReferences, findReferences, merge, newProblems, type Changes } from './references.js';
import {
    CONCEPT_BASE, contextTerms, declaredPrefixes, declarePrefix, isDeclaredPrefix, isUrl, openCsv, prefixOf, sourceDir, splitValues,
} from './repo.js';
import {
    checkReference, checkTexts, fail, NUMERIC_DATATYPES, ValidationError, writeResult, type LineChange, type Problems, type WriteResult,
} from './rules.js';

const FIELD_CODE = /^[a-z][a-z0-9_-]*$/;

/** Column order of a new operationeel_*.csv file. */
const OPERATIONAL_HEADER = [
    '_id', '_type', 'topConceptOf', 'inScheme', 'prefLabel', 'definition', 'broaderPartitive', 'relevantClass',
    'relevantFeatureClass', 'relevantDataType', 'relation', 'seeAlso', 'relevantRiepr', 'conditionPath', 'conditionValue',
    'relevantCodeList', 'relevantUnit', 'kwantiteitsAspect', 'drager', 'soortWaartbepaling', 'isVerplicht', 'isMeervoudig',
    'isMultiselect', 'isOnzichtbaar', '_ui_after', '_ui_first', 'related',
];

export interface FieldProperties {
    prefLabel: string;
    definition?: string;
    /** Composite field this is a part of (broaderPartitive). */
    parent?: string;
    datatype?: string;
    relation?: string;
    codeList?: string[];
    unit?: string[];
    relevantClass?: string;
    relevantFeatureClass?: string[];
    relevantRiepr?: string[];
    /** Next step(s): concept schemes. */
    seeAlso?: string[];
    conditionPath?: string;
    conditionValue?: string;
    related?: string[];
    kwantiteitsAspect?: string;
    drager?: string;
    soortWaartbepaling?: string;
    isVerplicht?: boolean;
    isMeervoudig?: boolean;
    isMultiselect?: boolean;
    isOnzichtbaar?: boolean;
    /** Show after this sibling (_ui_after). */
    uiAfter?: string;
    /** Show first among its siblings (_ui_first). */
    uiFirst?: boolean;
}

const COLUMNS: Record<keyof FieldProperties, string> = {
    prefLabel: 'prefLabel',
    definition: 'definition',
    parent: 'broaderPartitive',
    datatype: 'relevantDataType',
    relation: 'relation',
    codeList: 'relevantCodeList',
    unit: 'relevantUnit',
    relevantClass: 'relevantClass',
    relevantFeatureClass: 'relevantFeatureClass',
    relevantRiepr: 'relevantRiepr',
    seeAlso: 'seeAlso',
    conditionPath: 'conditionPath',
    conditionValue: 'conditionValue',
    related: 'related',
    kwantiteitsAspect: 'kwantiteitsAspect',
    drager: 'drager',
    soortWaartbepaling: 'soortWaartbepaling',
    isVerplicht: 'isVerplicht',
    isMeervoudig: 'isMeervoudig',
    isMultiselect: 'isMultiselect',
    isOnzichtbaar: 'isOnzichtbaar',
    uiAfter: '_ui_after',
    uiFirst: '_ui_first',
};

const LIST_FIELDS = new Set<keyof FieldProperties>(['codeList', 'unit', 'relevantFeatureClass', 'relevantRiepr', 'seeAlso', 'related']);
const FLAG_FIELDS = new Set<keyof FieldProperties>(['isVerplicht', 'isMeervoudig', 'isMultiselect', 'isOnzichtbaar', 'uiFirst']);

function fieldProperties(record: CsvRecord): FieldProperties {
    const properties: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(COLUMNS) as Array<[keyof FieldProperties, string]>) {
        const value = record[column] ?? '';
        if (LIST_FIELDS.has(key)) properties[key] = splitValues(value);
        else if (FLAG_FIELDS.has(key)) properties[key] = value === 'true';
        else properties[key] = value || undefined;
    }
    return properties as unknown as FieldProperties;
}

/** CSV cells for the given properties ('' clears a cell). */
function cells(properties: Partial<FieldProperties>): CsvInput {
    const result: CsvInput = {};
    for (const [key, value] of Object.entries(properties) as Array<[keyof FieldProperties, unknown]>) {
        const column = COLUMNS[key];
        if (!column) continue;
        if (Array.isArray(value)) result[column] = value.join('|');
        else if (typeof value === 'boolean') result[column] = value ? 'true' : '';
        else result[column] = (value as string | undefined)?.trim() ?? '';
    }
    return result;
}

/** Opens CSV files lazily and saves the touched ones together. */
class Files {
    private readonly open = new Map<string, CsvFile>();

    get(file: string): CsvFile {
        let csv = this.open.get(file);
        if (!csv) {
            csv = openCsv(file);
            this.open.set(file, csv);
        }
        return csv;
    }

    /** Adds the columns `record` needs; only columns that are context.json terms are allowed. */
    ensureColumns(file: string, record: CsvInput, changes: LineChange[]): void {
        const csv = this.get(file);
        const terms = contextTerms();
        for (const [column, value] of Object.entries(record)) {
            if (!value || csv.hasColumn(column)) continue;
            if (!terms.has(column)) throw new ValidationError(`Column '${column}' is not a term in src/source/context.json.`);
            csv.addColumn(column);
            changes.push({ file: `src/source/${file}`, note: `added column ${column}` });
        }
    }

    row(file: string, id: string) {
        return this.get(file).rows.find(r => !r.blank && r.record._id === id && r.record._type);
    }

    saveAll(dryRun: boolean): void {
        if (!dryRun) this.open.forEach(csv => csv.save());
    }
}

function located(repo: Repo, id: string, what: string): Located {
    const found = repo.byId.get(id);
    if (!found || !isOperationalFile(found.file)) throw new ValidationError(`${id} is not ${what} in thema_type.csv or operationeel_*.csv.`);
    return found;
}

function resolveStep(repo: Repo, step: string): Located {
    const candidates = step.includes(':') ? [step] : [`conceptscheme:${step}`, `conceptscheme:operationeel_${step}`];
    for (const id of candidates) {
        const found = repo.byId.get(id);
        if (found?.record._type === 'skos:ConceptScheme' && found.file !== THEMA_FILE && isOperationalFile(found.file)) return found;
    }
    throw new ValidationError(`'${step}' is not a step (concept scheme) in an operationeel_*.csv file.`);
}

function siblingsOf(repo: Repo, scheme: string, parent: string | undefined, exclude?: string): CsvRecord[] {
    return repo.conceptsOf(scheme).map(c => c.record).filter(r => (r.broaderPartitive || undefined) === parent && r._id !== exclude);
}

/** Checks the properties of a field in `scheme`; `id` is the field's own id. */
function checkField(repo: Repo, scheme: string, id: string, p: FieldProperties): Problems {
    const errors: string[] = [];
    const warnings: string[] = [];
    checkTexts({ prefLabel: p.prefLabel, definition: p.definition }, errors, warnings);
    const inStep = new Set(repo.conceptsOf(scheme).map(c => c.record._id));
    const codeList = p.codeList ?? [];
    const unit = p.unit ?? [];

    if (p.parent) {
        if (p.parent === id) errors.push('A field cannot be a part of itself.');
        else if (!inStep.has(p.parent)) errors.push(`parent ${p.parent} is not a field of ${scheme}.`);
        else {
            // No cycles through broaderPartitive.
            let current: string | undefined = p.parent;
            const seen = new Set<string>();
            while (current && !seen.has(current)) {
                if (current === id) {
                    errors.push(`parent ${p.parent} would make ${id} a part of itself.`);
                    break;
                }
                seen.add(current);
                current = repo.byId.get(current)?.record.broaderPartitive || undefined;
            }
            const parent = repo.byId.get(p.parent)!.record;
            if (parent.relevantDataType || parent.relevantCodeList) warnings.push(`parent ${p.parent} has its own datatype or code list; it becomes a composite with a value of its own.`);
        }
    }
    if (p.datatype && !(OPERATIONAL_DATATYPES as readonly string[]).includes(p.datatype)) {
        errors.push(`datatype '${p.datatype}' is not supported; use one of ${OPERATIONAL_DATATYPES.join(', ')}.`);
    }
    if (p.datatype && codeList.length) errors.push('Give either datatype or codeList, not both.');
    if (unit.length && !NUMERIC_DATATYPES.includes(p.datatype ?? '')) errors.push(`unit only applies to numeric datatypes (${NUMERIC_DATATYPES.join(', ')}).`);
    if (p.isMultiselect && !codeList.length && !(p.relevantRiepr ?? []).length) errors.push('isMultiselect only applies to a selection (codeList or relevantRiepr).');

    for (const list of codeList) {
        if (/TODO/i.test(list)) warnings.push(`codeList ${list} is a placeholder.`);
        else if (repo.byId.has(list)) {
            if (!repo.isList(list)) errors.push(`codeList ${list} is not a concept scheme or collection.`);
        } else {
            checkReference(list, 'codeList', errors);
            if (['conceptscheme', 'collectie'].includes(prefixOf(list) ?? '')) errors.push(`codeList ${list} does not exist in this repo.`);
        }
    }
    for (const value of unit) {
        if (/TODO/i.test(value)) warnings.push(`unit ${value} is a placeholder.`);
        else if (!repo.byId.has(value)) checkReference(value, 'unit', errors);
    }
    for (const next of p.seeAlso ?? []) {
        if (!isUrl(next) && !repo.isScheme(next)) errors.push(`seeAlso ${next} is not a step (concept scheme); create it with add_step.`);
        if (next === scheme) errors.push('seeAlso cannot point to the step the field is in.');
    }
    for (const value of p.relevantRiepr ?? []) {
        if (isUrl(value) || prefixOf(value) === 'riepr') continue;
        if (!repo.byId.has(value)) errors.push(`relevantRiepr ${value} does not exist (use a type, a type scheme, an eigenschap or riepr:<Klasse>).`);
    }
    for (const [field, value] of [['relation', p.relation], ['relevantClass', p.relevantClass], ['kwantiteitsAspect', p.kwantiteitsAspect], ['drager', p.drager], ['soortWaartbepaling', p.soortWaartbepaling]] as const) {
        if (value) checkReference(value, field, errors);
    }
    for (const value of p.relevantFeatureClass ?? []) checkReference(value, 'relevantFeatureClass', errors);

    if (Boolean(p.conditionPath) !== Boolean(p.conditionValue)) errors.push('conditionPath and conditionValue go together.');
    if (p.conditionPath) {
        if (p.conditionPath === id) errors.push('A field cannot depend on itself.');
        else if (!inStep.has(p.conditionPath)) errors.push(`conditionPath ${p.conditionPath} is not a field of ${scheme}.`);
        else {
            const trigger = repo.byId.get(p.conditionPath)!.record;
            const options = splitValues(trigger.relevantCodeList).flatMap(list => repo.listMembers(list).map(m => m.id));
            if (options.length && !options.includes(p.conditionValue ?? '')) {
                errors.push(`conditionValue ${p.conditionValue} is not an option of ${p.conditionPath} (${options.join(', ')}).`);
            }
            if (trigger.relevantDataType === 'xsd:boolean' && !['true', 'false'].includes(p.conditionValue ?? '')) {
                errors.push(`conditionValue of the checkbox ${p.conditionPath} must be true or false.`);
            }
        }
    }
    for (const other of p.related ?? []) {
        if (other === id) errors.push('A field cannot be related to itself.');
        else if (!inStep.has(other)) errors.push(`related ${other} is not a field of ${scheme}.`);
    }

    if (p.uiFirst && p.uiAfter) errors.push('Give either uiFirst or uiAfter, not both.');
    if (p.uiAfter) {
        const siblings = siblingsOf(repo, scheme, p.parent, id).map(s => s._id);
        if (!siblings.includes(p.uiAfter)) errors.push(`uiAfter ${p.uiAfter} is not a sibling of this field (same step and parent): ${siblings.join(', ') || 'none'}.`);
        let current: string | undefined = p.uiAfter;
        const seen = new Set<string>();
        while (current && !seen.has(current)) {
            if (current === id) {
                errors.push(`uiAfter ${p.uiAfter} creates an ordering cycle.`);
                break;
            }
            seen.add(current);
            current = repo.byId.get(current)?.record._ui_after || undefined;
        }
    }
    if (p.uiFirst) {
        const other = siblingsOf(repo, scheme, p.parent, id).find(s => s._ui_first === 'true');
        if (other) warnings.push(`${other._id} is also marked first; consider reorder_fields.`);
    }
    return { errors, warnings };
}

/** Keeps `related` symmetric: every variant lists all the others. */
function syncRelated(files: Files, repo: Repo, id: string, before: string[], after: string[], changes: LineChange[]): void {
    for (const other of new Set([...before, ...after])) {
        const at = repo.byId.get(other);
        if (!at) continue;
        const row = files.row(at.file, other);
        if (!row) continue;
        const current = splitValues(row.record.related);
        const next = after.includes(other)
            ? [...new Set([...current, id])]
            : current.filter(v => v !== id);
        if (next.join('|') === current.join('|')) continue;
        const csv = files.get(at.file);
        const oldLine = csv.lines[row.index];
        files.ensureColumns(at.file, { related: next.join('|') }, changes);
        const newLine = csv.replaceLine(row.index, { ...row.record, related: next.join('|') });
        changes.push({ file: `src/source/${at.file}`, line: row.index + 1, before: oldLine, after: newLine, note: 'related kept symmetric' });
    }
}

/** Prefix of the field ids in a step: the one its fields (or the fields in its file) use. */
function stepPrefix(repo: Repo, step: Located, prefix?: string): string {
    if (prefix) {
        if (!isDeclaredPrefix(prefix)) throw new ValidationError(`prefix '${prefix}:' is not declared in config.yml.`);
        return prefix;
    }
    const inStep = repo.conceptsOf(step.record._id).map(c => prefixOf(c.record._id));
    const inFile = repo.rows.filter(r => r.file === step.file && r.record._type === 'skos:Concept').map(r => prefixOf(r.record._id));
    // A new flow file has no fields yet: use the prefix declared for operationeel-<flow>/.
    const flow = /^operationeel_(.+)\.csv$/.exec(step.file)?.[1].replace(/_/g, '-');
    const declared = Object.entries(declaredPrefixes()).find(([, uri]) => uri === `${CONCEPT_BASE}operationeel-${flow}/`)?.[0];
    const found = [...inStep, ...inFile].find(Boolean) ?? declared;
    if (!found) throw new ValidationError(`Cannot derive the id prefix for ${step.record._id}; pass prefix.`);
    return found;
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export function addField(params: FieldProperties & { step: string; code: string; prefix?: string; dryRun?: boolean }): WriteResult {
    const { step, code, prefix, dryRun = true, ...properties } = params;
    const repo = new Repo();
    const scheme = resolveStep(repo, step);
    const schemeId = scheme.record._id;
    if (!FIELD_CODE.test(code)) throw new ValidationError(`code '${code}' must be lowercase (a-z, 0-9, _ or -), e.g. 'brandstof_naam'.`);
    const id = `${stepPrefix(repo, scheme, prefix)}:${code}`;
    if (repo.byId.has(id)) throw new ValidationError(`${id} already exists.`);

    // Follow the ordering style of the siblings: when they are ordered, append after the last one.
    const fields: FieldProperties = { ...properties };
    const siblings = siblingsOf(repo, schemeId, fields.parent);
    if (!fields.uiFirst && !fields.uiAfter && siblings.some(s => s._ui_first === 'true' || s._ui_after)) {
        const ordered = uiOrder(siblings).filter(s => !s.conditionPath);
        fields.uiAfter = ordered.at(-1)?._id;
    } else if (!fields.uiFirst && !fields.uiAfter && siblings.length === 0) {
        fields.uiFirst = true;
    }
    const { errors, warnings } = checkField(repo, schemeId, id, fields);
    fail(errors);

    const files = new Files();
    const changes: LineChange[] = [];
    const record: CsvInput = {
        _id: id,
        _type: 'skos:Concept',
        topConceptOf: fields.parent ? '' : schemeId,
        inScheme: schemeId,
        ...cells(fields),
    };
    files.ensureColumns(scheme.file, record, changes);
    const csv = files.get(scheme.file);

    // Below the parent and its parts, or at the end of the step.
    let after = csv.rows.find(r => r.record._id === schemeId)?.index ?? 0;
    const subtree = new Set([fields.parent ?? schemeId]);
    for (const row of csv.rows.filter(r => !r.blank)) {
        const r = row.record;
        if (fields.parent ? (subtree.has(r._id) || subtree.has(r.broaderPartitive)) : r.inScheme === schemeId) {
            if (fields.parent) subtree.add(r._id);
            after = row.index;
        }
    }
    const lines = csv.insertAfter(after, [record]);
    syncRelated(files, repo, id, [], fields.related ?? [], changes);
    files.saveAll(dryRun);
    return writeResult({ action: `add field ${id} to ${schemeId}`, file: `src/source/${scheme.file}`, insertedLines: lines, changes, warnings, dryRun });
}

export type FieldChanges = Changes<FieldProperties> & { notation?: string | null };

export function updateFlowItem({ id, set, dryRun = true }: { id: string; set: FieldChanges; dryRun?: boolean }): WriteResult {
    if ('code' in set || '_id' in set) throw new ValidationError('The id is a published URI and cannot be changed; add a new item and delete this one instead.');
    const repo = new Repo();
    const at = located(repo, id, 'a thema, step or field');
    const files = new Files();
    const changes: LineChange[] = [];
    const csv = files.get(at.file);
    const row = files.row(at.file, id)!;
    const r = row.record;
    let warnings: string[] = [];
    let newCells: CsvInput;

    if (r._type === 'skos:ConceptScheme' || at.file === THEMA_FILE) {
        // Steps and themas: labels, and for a thema its notation and first step.
        const allowed = r._type === 'skos:ConceptScheme' ? ['prefLabel', 'definition'] : ['prefLabel', 'definition', 'notation', 'seeAlso'];
        const unknown = Object.keys(set).filter(k => !allowed.includes(k));
        if (unknown.length) throw new ValidationError(`For ${id} only ${allowed.join(', ')} can be changed (not ${unknown.join(', ')}).`);
        const errors: string[] = [];
        const before: Problems = { errors: [], warnings: [] };
        checkTexts({ prefLabel: r.prefLabel, definition: r.definition || undefined }, before.errors, before.warnings);
        const merged = { prefLabel: set.prefLabel ?? r.prefLabel, definition: set.definition === null ? undefined : (set.definition ?? (r.definition || undefined)) };
        const after: Problems = { errors, warnings: [] };
        checkTexts(merged, after.errors, after.warnings);
        for (const next of set.seeAlso ?? []) if (!repo.isScheme(next)) errors.push(`seeAlso ${next} is not a step.`);
        const problems = newProblems(before, after);
        fail(problems.errors);
        warnings = problems.warnings;
        newCells = {};
        if (set.prefLabel !== undefined) newCells.prefLabel = set.prefLabel?.trim() ?? '';
        if (set.definition !== undefined) newCells.definition = set.definition?.trim() ?? '';
        if (set.notation !== undefined) newCells.notation = set.notation?.trim() ?? '';
        if (set.seeAlso !== undefined) newCells.seeAlso = (set.seeAlso ?? []).join('|');
    } else {
        const current = fieldProperties(r);
        const target = merge(current, set as Changes<FieldProperties>);
        const before = checkField(repo, r.inScheme, id, current);
        const after = checkField(repo, r.inScheme, id, target);
        const problems = newProblems(before, after);
        fail(problems.errors);
        warnings = problems.warnings;
        const changed = Object.fromEntries(Object.keys(set).filter(k => k in COLUMNS).map(k => [k, target[k as keyof FieldProperties]]));
        newCells = cells(changed as Partial<FieldProperties>);
        if ('parent' in set) newCells.topConceptOf = target.parent ? '' : r.inScheme;
        if ('uiFirst' in set && target.uiFirst) newCells._ui_after = '';
        if ('uiAfter' in set && target.uiAfter) newCells._ui_first = '';
        if ('related' in set) syncRelated(files, repo, id, current.related ?? [], target.related ?? [], changes);
    }

    files.ensureColumns(at.file, newCells, changes);
    const oldLine = csv.lines[row.index];
    const newLine = csv.replaceLine(row.index, { ...row.record, ...newCells });
    if (newLine === oldLine && changes.length === 0) throw new ValidationError(`Nothing changes for ${id}.`);
    changes.unshift({ file: `src/source/${at.file}`, line: row.index + 1, before: oldLine, after: newLine });
    files.saveAll(dryRun);
    return writeResult({ action: `update ${id}`, changes, warnings, dryRun });
}

/** Repoints _ui_after of the siblings that follow a removed field, so the order stays intact. */
function closeOrderingGap(files: Files, file: string, removed: CsvRecord, removedIds: Set<string>, changes: LineChange[]): void {
    const csv = files.get(file);
    for (const row of csv.rows.filter(r => !r.blank && r.record._ui_after === removed._id && !removedIds.has(r.record._id))) {
        const update = removed._ui_first === 'true' ? { _ui_first: 'true', _ui_after: '' } : { _ui_after: removed._ui_after };
        const before = csv.lines[row.index];
        const after = csv.replaceLine(row.index, { ...row.record, ...update });
        changes.push({ file: `src/source/${file}`, line: row.index + 1, before, after, note: 'ordering kept intact' });
    }
}

export function deleteField({ field, dryRun = true }: { field: string; dryRun?: boolean }): WriteResult {
    const repo = new Repo();
    const at = located(repo, field, 'a field');
    if (at.record._type !== 'skos:Concept' || at.file === THEMA_FILE) throw new ValidationError(`${field} is not a field; use delete_step or update_flow_item for steps and themas.`);

    // The field with all its (nested) parts.
    const ids = new Set([field]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const c of repo.conceptsOf(at.record.inScheme)) {
            if (ids.has(c.record.broaderPartitive) && !ids.has(c.record._id)) {
                ids.add(c.record._id);
                grew = true;
            }
        }
    }
    const references = findReferences([...ids], {
        ignore: ({ row, column }) => ids.has(row.record._id) || column === '_ui_after' || column === 'related',
    });
    fail(references.length ? [`${field} is still used; change these rows first:\n${describeReferences(references)}`] : []);

    const files = new Files();
    const changes: LineChange[] = [];
    syncRelated(files, repo, field, splitValues(at.record.related), [], changes);
    closeOrderingGap(files, at.file, at.record, ids, changes);
    const csv = files.get(at.file);
    const removed = csv.removeLines(csv.rows.filter(r => !r.blank && ids.has(r.record._id)).map(r => r.index));
    changes.push({ file: `src/source/${at.file}`, removed });
    files.saveAll(dryRun);
    return writeResult({
        action: `delete field ${field}${ids.size > 1 ? ` with ${ids.size - 1} part(s)` : ''}`,
        changes,
        warnings: ['After publication the removed concepts are marked adms:status Withdrawn by generate_skos.'],
        dryRun,
    });
}

export function reorderFields({ step, parent, order, dryRun = true }: { step: string; parent?: string; order: string[]; dryRun?: boolean }): WriteResult {
    const repo = new Repo();
    const scheme = resolveStep(repo, step);
    const siblings = siblingsOf(repo, scheme.record._id, parent);
    const ids = siblings.map(s => s._id);
    const missing = ids.filter(id => !order.includes(id));
    const unknown = order.filter(id => !ids.includes(id));
    if (missing.length || unknown.length || new Set(order).size !== order.length) {
        throw new ValidationError(
            `order must list every field ${parent ? `of ${parent}` : `at the top of ${scheme.record._id}`} exactly once: ${ids.join(', ')}` +
            `${missing.length ? `\nmissing: ${missing.join(', ')}` : ''}${unknown.length ? `\nnot siblings: ${unknown.join(', ')}` : ''}`,
        );
    }
    const files = new Files();
    const changes: LineChange[] = [];
    const csv = files.get(scheme.file);
    order.forEach((id, i) => {
        const row = files.row(scheme.file, id)!;
        const update = i === 0 ? { _ui_first: 'true', _ui_after: '' } : { _ui_first: '', _ui_after: order[i - 1] };
        files.ensureColumns(scheme.file, update, changes);
        const before = csv.lines[row.index];
        const after = csv.replaceLine(row.index, { ...row.record, ...update });
        if (after !== before) changes.push({ file: `src/source/${scheme.file}`, line: row.index + 1, before, after });
    });
    if (changes.length === 0) throw new ValidationError('The fields are already in this order.');
    const conditional = siblings.filter(s => s.conditionPath && ids.includes(s.conditionPath)).map(s => s._id);
    files.saveAll(dryRun);
    return writeResult({
        action: `reorder ${order.length} fields in ${scheme.record._id}`,
        changes,
        warnings: conditional.length
            ? [`Conditional fields (${conditional.join(', ')}) are always rendered after the other fields, whatever their position here.`]
            : [],
        dryRun,
    });
}

// ---------------------------------------------------------------------------
// Steps and flows
// ---------------------------------------------------------------------------

export function addStep(params: { name: string; prefLabel?: string; definition?: string; from?: string; file?: string; replaceNext?: boolean; dryRun?: boolean }): WriteResult {
    const { name, prefLabel, definition, from, replaceNext = false, dryRun = true } = params;
    const repo = new Repo();
    const id = name.includes(':') ? name : `conceptscheme:${name}`;
    const errors: string[] = [];
    const warnings: string[] = [];
    if (prefixOf(id) !== 'conceptscheme' || !/^[a-z][a-z0-9_]*$/.test(id.split(':')[1])) errors.push(`step name '${name}' must be snake_case, e.g. 'operationeel_lucht_emissie'.`);
    else if (!id.split(':')[1].startsWith('operationeel_')) warnings.push('By convention step names start with operationeel_<flow>_.');
    if (repo.byId.has(id)) errors.push(`${id} already exists.`);
    if (prefLabel !== undefined) checkTexts({ prefLabel, definition }, errors, warnings);

    let file = params.file;
    let source: Located | undefined;
    if (from) {
        source = located(repo, from, 'a field or thema');
        if (source.record._type !== 'skos:Concept') errors.push(`from ${from} must be a field or thema.`);
        const existing = splitValues(source.record.seeAlso);
        if (existing.length && !replaceNext) errors.push(`${from} already leads to ${existing.join(', ')}; pass replaceNext=true to replace that.`);
        file ??= source.file === THEMA_FILE ? undefined : source.file;
    }
    if (!file) errors.push('Give file (an operationeel_*.csv) or from (a field in such a file).');
    else if (!isOperationalFile(file) || file === THEMA_FILE) errors.push(`${file} is not an operationeel_*.csv file.`);
    fail(errors);

    const files = new Files();
    const changes: LineChange[] = [];
    const lines = files.get(file!).appendBlock([{ _id: id, _type: 'skos:ConceptScheme', prefLabel: prefLabel?.trim(), definition: definition?.trim() }]);
    if (source) {
        const csv = files.get(source.file);
        const row = files.row(source.file, source.record._id)!;
        files.ensureColumns(source.file, { seeAlso: id }, changes);
        const before = csv.lines[row.index];
        const after = csv.replaceLine(row.index, { ...row.record, seeAlso: id });
        changes.push({ file: `src/source/${source.file}`, line: row.index + 1, before, after, note: 'leads to the new step' });
    } else {
        warnings.push('No field leads to this step yet: set seeAlso on a field (update_flow_item) to connect it.');
    }
    files.saveAll(dryRun);
    return writeResult({
        action: `add step ${id}`, file: `src/source/${file}`, insertedLines: lines, changes, warnings, dryRun,
        use: `Add its fields with add_field step='${id}'.`,
    });
}

export function deleteStep({ step, unlink = false, dryRun = true }: { step: string; unlink?: boolean; dryRun?: boolean }): WriteResult {
    const repo = new Repo();
    const scheme = resolveStep(repo, step);
    const id = scheme.record._id;
    const members = repo.conceptsOf(id).map(c => c.record._id);
    const own = new Set([id, ...members]);
    const references = findReferences([id, ...members], { ignore: ({ row }) => own.has(row.record._id) });
    const links = references.filter(r => r.column === 'seeAlso' && r.id === id);
    const blocking = references.filter(r => !links.includes(r));
    const errors: string[] = [];
    if (blocking.length) errors.push(`${id} or its fields are still used; change these rows first:\n${describeReferences(blocking)}`);
    if (links.length && !unlink) {
        errors.push(`These rows lead to ${id}:\n${describeReferences(links)}\nPass unlink=true to remove those seeAlso links too (after confirming with the user).`);
    }
    fail(errors);

    const files = new Files();
    const changes: LineChange[] = [];
    for (const link of links) {
        const file = path.basename(link.file);
        const csv = files.get(file);
        const row = csv.rows.find(r => r.index + 1 === link.line)!;
        const before = csv.lines[row.index];
        const after = csv.replaceLine(row.index, { ...row.record, seeAlso: splitValues(row.record.seeAlso).filter(v => v !== id).join('|') });
        changes.push({ file: link.file, line: link.line, before, after, note: 'link to the deleted step removed' });
    }
    const csv = files.get(scheme.file);
    const removed = csv.removeLines(csv.rows.filter(r => !r.blank && own.has(r.record._id) && r.record._type).map(r => r.index));
    changes.push({ file: `src/source/${scheme.file}`, removed });
    files.saveAll(dryRun);
    return writeResult({
        action: `delete step ${id} with ${members.length} field(s)`,
        changes,
        warnings: ['After publication the removed concepts are marked adms:status Withdrawn by generate_skos.'],
        dryRun,
    });
}

export function addFlow(params: { code: string; prefLabel: string; definition?: string; notation?: string; stepLabel?: string; dryRun?: boolean }): WriteResult {
    const { code, prefLabel, definition, stepLabel, dryRun = true } = params;
    const repo = new Repo();
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!/^[a-z][a-z0-9-]*$/.test(code)) errors.push(`code '${code}' must be lowercase with hyphens, e.g. 'zelfcontrole-lucht'.`);
    checkTexts({ prefLabel, definition }, errors, warnings);
    const themaId = `thema:${code}`;
    const base = code.replace(/-/g, '_');
    const file = `operationeel_${base}.csv`;
    const schemeId = `conceptscheme:operationeel_${base}`;
    const prefixUri = `${CONCEPT_BASE}operationeel-${code}/`;
    const notation = params.notation ?? `THEMA_${base.toUpperCase()}`;
    if (repo.byId.has(themaId)) errors.push(`${themaId} already exists.`);
    if (repo.byId.has(schemeId)) errors.push(`${schemeId} already exists.`);
    if (fs.existsSync(path.join(sourceDir(), file))) errors.push(`src/source/${file} already exists.`);
    if (isDeclaredPrefix(code)) errors.push(`prefix '${code}:' is already declared; choose another code.`);
    if (contextTerms().has(code)) errors.push(`'${code}' is a term in context.json and cannot be used as prefix (like status → status-type); choose another code.`);
    fail(errors);

    const changes: LineChange[] = [];
    const header = OPERATIONAL_HEADER.join(',');
    const blank = ','.repeat(OPERATIONAL_HEADER.length - 1);
    const schemeRow: CsvInput = { _id: schemeId, _type: 'skos:ConceptScheme', prefLabel: (stepLabel ?? prefLabel).trim() };
    const schemeLine = OPERATIONAL_HEADER.map(column => escapeCsvField(schemeRow[column])).join(',');
    const otherChanges: string[] = [`create src/source/${file}`];

    const files = new Files();
    const themaCsv = files.get(THEMA_FILE);
    const lastThema = themaCsv.rows.filter(r => !r.blank && r.record.inScheme === THEMA_SCHEME).at(-1)!;
    const themaLines = themaCsv.insertAfter(lastThema.index, [{
        _id: themaId, _type: 'skos:Concept', topConceptOf: THEMA_SCHEME, inScheme: THEMA_SCHEME,
        prefLabel: prefLabel.trim(), notation, definition: definition?.trim(), seeAlso: schemeId,
    }]);
    changes.push({ file: `src/source/${THEMA_FILE}`, after: themaLines[0] });

    const configPath = path.join(sourceDir(), 'config.yml');
    const config = fs.readFileSync(configPath, 'utf8').split('\n');
    const lastOperational = config.map((l, i) => (/^\s+- operationeel_.*\.csv\s*$/.test(l) ? i : -1)).filter(i => i >= 0).at(-1);
    if (lastOperational === undefined) throw new ValidationError('Could not find the operationeel_*.csv entries in config.yml.');
    const indent = /^(\s+)-/.exec(config[lastOperational])![1];
    otherChanges.push(`src/source/config.yml: add ${file} to source.codelijst_csv`, `src/source/config.yml and README.md: declare prefix ${code}: ${prefixUri}`);

    if (!dryRun) {
        fs.writeFileSync(path.join(sourceDir(), file), `${header}\n${schemeLine}\n${blank}\n`, 'utf8');
        config.splice(lastOperational + 1, 0, `${indent}- ${file}`);
        fs.writeFileSync(configPath, config.join('\n'), 'utf8');
        declarePrefix({ prefix: code, uri: prefixUri });
    }
    files.saveAll(dryRun);
    return writeResult({
        action: `add flow ${themaId}`, file: `src/source/${file}`, insertedLines: [header, schemeLine], changes, otherChanges, warnings, dryRun,
        use: `Add the fields of the first step with add_field step='${schemeId}' (ids get the prefix '${code}:'), and further steps with add_step.`,
    });
}
