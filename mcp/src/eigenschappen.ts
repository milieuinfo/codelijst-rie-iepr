// Eigenschappen: src/source/<systeem>_eigenschappen.csv.

import type { CsvFile, CsvInput, CsvRecord } from './csv.js';
import { applyMembershipEdits, describeList, isOwnListRow, listRowIndexes } from './lists.js';
import { assertNoRename, conceptRow, describeReferences, findReferences, merge, newProblems, type Changes, type LineChange } from './references.js';
import { conceptIndex, openCsv, prefixOf, splitValues, systemNames, type SystemNames } from './repo.js';
import {
    checkCode, checkReference, checkTexts, DATATYPES, fail, explicitFlag, firstBlockEnd, flag, KNOWN_RELATIONS, LIST_TYPES,
    NUMERIC_DATATYPES, toId, ValidationError, writeResult, type Problems, type WriteResult,
} from './rules.js';
import { listTypes } from './systeemtypes.js';

export type CodeListSource = 'published' | 'inline';

/**
 * Asks the user whether a code list is already published or defined inline;
 * resolves to undefined when the client cannot be asked.
 */
export type AskCodeListSource = (codeList: string[]) => Promise<CodeListSource | undefined>;

export interface PropertyFields {
    code: string;
    prefLabel: string;
    definition: string;
    altLabel?: string;
    scopeNote?: string;
    /** Composite this property is a part of (broaderPartitive). */
    parent?: string;
    /** A composite only groups its parts. */
    composite?: boolean;
    /** relevantRiepr: types (or "all") this property applies to. */
    appliesTo?: string[];
    datatype?: string;
    relation?: string;
    relevantProperty?: string;
    unit?: string[];
    codeList?: string[];
    codeListSource?: CodeListSource;
    isVerplicht?: boolean;
    isMeervoudig?: boolean;
    isMultiselect?: boolean;
}

export type EditablePropertyFields = Omit<PropertyFields, 'code' | 'composite'>;

export function listProperties(system: string) {
    const names = systemNames(system);
    const csv = openCsv(names.propertyFile);
    const records = csv.records;
    const toEntry = (r: CsvRecord) => ({
        id: r._id,
        prefLabel: r.prefLabel,
        definition: r.definition || undefined,
        appliesTo: splitValues(r.relevantRiepr),
        relation: r.relation || undefined,
        datatype: r.relevantDataType || undefined,
        codeList: splitValues(r.relevantCodeList),
        unit: splitValues(r.relevantUnit),
        relevantProperty: r.relevantProperty || undefined,
        isVerplicht: r.isVerplicht || undefined,
        isMeervoudig: r.isMeervoudig || undefined,
        isMultiselect: r.isMultiselect || undefined,
    });
    const properties = records
        .filter(r => r.inScheme === names.propertyScheme && !r.broaderPartitive)
        .map(r => {
            const parts = records.filter(c => c.broaderPartitive === r._id).map(toEntry);
            return parts.length > 0 ? { ...toEntry(r), composite: true, parts } : toEntry(r);
        });
    const lists = records
        .filter(r => LIST_TYPES.includes(r._type) && r._id !== names.propertyScheme)
        .map(r => describeList(csv, r._id));
    return {
        file: `src/source/${names.propertyFile}`,
        conceptScheme: names.propertyScheme,
        prefix: `${names.propertyPrefix}:`,
        columns: csv.header,
        properties,
        inlineSelectionLists: lists,
        availableTypes: listTypes(system).types.map(t => t.id).concat(names.typeScheme),
    };
}

/** Validates property fields and builds the CSV record. `existingId` is set when editing. */
export async function buildProperty(
    fields: PropertyFields,
    { names, csv, existingId, askCodeListSource }: { names: SystemNames; csv: CsvFile; existingId?: string; askCodeListSource?: AskCodeListSource },
): Promise<Problems & { record: CsvInput }> {
    const {
        code, prefLabel, definition, altLabel, scopeNote, parent, composite = false,
        appliesTo = [], datatype, relation, relevantProperty, unit = [], codeList = [],
        isVerplicht = false, isMeervoudig = false, isMultiselect = false,
    } = fields;
    let { codeListSource } = fields;
    const typeIds = new Set(openCsv(names.typeFile).records.map(r => r._id));
    const records = csv.records;
    const errors: string[] = [];
    const warnings: string[] = [];

    checkCode(code, 'code', errors);
    checkTexts({ prefLabel, definition: definition ?? '' }, errors, warnings);
    const id = `${names.propertyPrefix}:${code}`;
    if (id !== existingId && conceptIndex().has(id)) errors.push(`${id} already exists.`);

    let parentId: string | undefined;
    if (parent) {
        parentId = toId(parent, names.propertyPrefix);
        const parentRecord = records.find(r => r._id === parentId);
        if (parentId === id) errors.push('A property cannot be a part of itself.');
        else if (!parentRecord) errors.push(`parent '${parentId}' does not exist in ${names.propertyFile}.`);
        else if (parentRecord.broaderPartitive) errors.push(`parent '${parentId}' is itself a part; composites are one level deep.`);
        else if (parentRecord.relevantDataType || parentRecord.relevantCodeList) {
            errors.push(`parent '${parentId}' is a leaf property (it has a datatype or code list); only composite properties can have parts.`);
        }
        const parentCode = parentId.split(':')[1];
        if (!code.startsWith(`${parentCode}_`)) {
            warnings.push(`By convention a part's code starts with its parent's code: '${parentCode}_<part>'.`);
        }
        if (parentRecord && !parentRecord.relevantRiepr && appliesTo.length === 0) {
            warnings.push(`${parentId} has no appliesTo itself, so this part applies to no type: give it appliesTo (relevantRiepr).`);
        }
    } else if (appliesTo.length === 0) {
        // A composite (parts point to it with broaderPartitive) may carry relevantRiepr on its parts
        // instead, e.g. meetpunt-eigenschappen:referentiepunt with _naam and _diepte on meetpunt:peilput.
        const partsApply = existingId !== undefined && records.some(r => r.broaderPartitive === existingId && r.relevantRiepr);
        if (!composite) {
            errors.push(`appliesTo (relevantRiepr) is required for a top-level property: give one or more types of ${names.typeFile}, or '${names.typeScheme}' for all types.`);
        } else if (!partsApply) {
            warnings.push(`${id} applies to no type yet: give appliesTo on the composite, or on each of its parts.`);
        }
    }

    const appliesToIds = appliesTo.map(v => (v === 'all' ? names.typeScheme : toId(v, names.typePrefix)));
    for (const value of appliesToIds) {
        if (value !== names.typeScheme && !typeIds.has(value)) {
            errors.push(`appliesTo '${value}' is not a type in ${names.typeFile} (available: ${[...typeIds].join(', ')}).`);
        }
    }

    if (composite) {
        if (datatype || codeList.length || unit.length || relation || relevantProperty || isMultiselect) {
            errors.push('A composite property only groups its parts: leave datatype, codeList, unit, relation, relevantProperty and isMultiselect empty and add the parts with parent=<this code>.');
        }
    } else {
        if (!datatype && codeList.length === 0) errors.push(`A property needs either a datatype (${DATATYPES.join(', ')}) or a codeList (selection).`);
        if (datatype && codeList.length > 0) errors.push('Give either datatype or codeList, not both.');
        if (datatype && !(DATATYPES as readonly string[]).includes(datatype)) errors.push(`datatype '${datatype}' is not supported; use one of ${DATATYPES.join(', ')}.`);
        if (unit.length > 0 && !NUMERIC_DATATYPES.includes(datatype ?? '')) errors.push(`unit only applies to numeric datatypes (${NUMERIC_DATATYPES.join(', ')}).`);
        if (isMultiselect && codeList.length === 0) errors.push('isMultiselect only applies to properties with a codeList.');
        if (relation) checkReference(relation, 'relation', errors);
        if (relation && !KNOWN_RELATIONS.includes(relation)) warnings.push(`relation '${relation}' is not one of the usual ${KNOWN_RELATIONS.join(', ')}.`);
        if (relevantProperty) checkReference(relevantProperty, 'relevantProperty', errors);
    }

    for (const value of unit) {
        const local = records.find(r => r._id === value);
        if (local && !LIST_TYPES.includes(local._type)) {
            errors.push(`unit '${value}' is defined in ${names.propertyFile} but is not a collection or concept scheme.`);
        } else if (!local) checkReference(value, 'unit', errors);
    }

    if (codeList.length > 0) {
        if (!codeListSource && askCodeListSource) codeListSource = await askCodeListSource(codeList);
        if (!codeListSource) {
            errors.push(
                `Ask the user whether ${codeList.join(', ')} is an already published code list ` +
                `(codeListSource='published') or a new list defined in ${names.propertyFile} ` +
                `(codeListSource='inline', create it first with add_selection_list).`,
            );
        }
        const index = conceptIndex();
        for (const value of codeList) {
            const local = describeList(csv, value);
            if (codeListSource === 'inline' && !local) {
                errors.push(`codeList '${value}' is not a concept scheme or collection in ${names.propertyFile}; create it first with add_selection_list.`);
            }
            if (codeListSource === 'published') {
                if (local) errors.push(`codeList '${value}' is defined inline in ${names.propertyFile}; use codeListSource='inline'.`);
                else {
                    checkReference(value, 'codeList', errors);
                    const elsewhere = index.get(value);
                    if (elsewhere && !elsewhere.some(e => LIST_TYPES.includes(e.type))) {
                        errors.push(`codeList '${value}' exists in ${elsewhere[0].file} but is not a concept scheme or collection.`);
                    }
                    if (!elsewhere && ['conceptscheme', 'collectie'].includes(prefixOf(value) ?? '')) {
                        warnings.push(`codeList '${value}' is not defined in any source CSV of this repo; make sure it is published.`);
                    }
                }
            }
        }
    }

    const record: CsvInput = {
        _id: id,
        _type: 'skos:Concept',
        topConceptOf: parentId ? '' : names.propertyScheme,
        inScheme: names.propertyScheme,
        prefLabel: prefLabel?.trim(),
        altLabel,
        definition: definition?.trim(),
        scopeNote,
        broaderPartitive: parentId,
        relation: composite ? '' : (relation ?? 'rdfs:value'),
        relevantDataType: datatype,
        relevantCodeList: codeList.join('|'),
        relevantRiepr: appliesToIds.join('|'),
        relevantProperty,
        relevantUnit: unit.join('|'),
        isVerplicht: explicitFlag(isVerplicht),
        isMeervoudig: explicitFlag(isMeervoudig),
        isMultiselect: flag(isMultiselect),
    };
    return { record, errors, warnings };
}

/** Line after which a part of `parentId` belongs: below the parent and its existing parts. */
function partPosition(csv: CsvFile, parentId: string): number {
    let after = 0;
    for (const row of csv.rows) {
        if (row.record._id === parentId || row.record.broaderPartitive === parentId) after = row.index;
    }
    return after;
}

export async function addProperty(
    params: PropertyFields & { system: string; dryRun?: boolean },
    { askCodeListSource }: { askCodeListSource?: AskCodeListSource } = {},
): Promise<WriteResult> {
    const { system, dryRun = true } = params;
    const names = systemNames(system);
    const csv = openCsv(names.propertyFile);
    const { record, errors, warnings } = await buildProperty(params, { names, csv, askCodeListSource });
    fail(errors);

    const changes: string[] = [];
    if (record.isMultiselect && csv.addColumn('isMultiselect')) changes.push(`${names.propertyFile}: added column isMultiselect`);

    // New top-level properties go at the end of the property block; parts go
    // directly below their parent and its existing parts.
    const after = record.broaderPartitive ? partPosition(csv, record.broaderPartitive) : firstBlockEnd(csv);
    const lines = csv.insertAfter(after, [record]);
    if (!dryRun) csv.save();
    return writeResult({
        action: `add property ${record._id}`, file: `src/source/${names.propertyFile}`, insertedLines: lines, otherChanges: changes, warnings, dryRun,
    });
}

function propertyFields(record: CsvRecord, csv: CsvFile, names: SystemNames): PropertyFields {
    const codeList = splitValues(record.relevantCodeList);
    return {
        code: record._id.slice(names.propertyPrefix.length + 1),
        prefLabel: record.prefLabel,
        definition: record.definition,
        altLabel: record.altLabel || undefined,
        scopeNote: record.scopeNote || undefined,
        parent: record.broaderPartitive || undefined,
        composite: csv.records.some(r => r.broaderPartitive === record._id),
        appliesTo: splitValues(record.relevantRiepr),
        datatype: record.relevantDataType || undefined,
        // Keep an empty relation empty instead of defaulting it to rdfs:value.
        relation: record.relation ?? '',
        relevantProperty: record.relevantProperty || undefined,
        unit: splitValues(record.relevantUnit),
        codeList,
        codeListSource: codeList.length === 0 ? undefined : codeList.every(c => describeList(csv, c)) ? 'inline' : 'published',
        isVerplicht: record.isVerplicht === 'true',
        isMeervoudig: record.isMeervoudig === 'true',
        isMultiselect: record.isMultiselect === 'true',
    };
}

export async function updateProperty(
    { system, property, set = {}, dryRun = true }: { system: string; property: string; set?: Changes<EditablePropertyFields>; dryRun?: boolean },
    { askCodeListSource }: { askCodeListSource?: AskCodeListSource } = {},
): Promise<WriteResult> {
    const names = systemNames(system);
    const csv = openCsv(names.propertyFile);
    const id = toId(property, names.propertyPrefix);
    const row = conceptRow(csv, id);
    if (!row || row.record.inScheme !== names.propertyScheme) throw new ValidationError(`${id} is not an eigenschap in ${names.propertyFile}.`);
    assertNoRename(set, 'eigenschap');

    const current = propertyFields(row.record, csv, names);
    const target = merge(current, set);
    const codeListChanged = set.codeList !== undefined && (set.codeList ?? []).join('|') !== (current.codeList ?? []).join('|');
    if (codeListChanged) target.codeListSource = set.codeListSource ?? undefined;
    if (!current.composite && !current.relation && set.relation === undefined && (set.datatype || set.codeList)) target.relation = 'rdfs:value';

    const before = await buildProperty(current, { names, csv, existingId: id });
    const after = await buildProperty(target, { names, csv, existingId: id, askCodeListSource: codeListChanged ? askCodeListSource : undefined });
    const { errors, warnings } = newProblems(before, after);
    fail(errors);

    const changes: LineChange[] = [];
    if (after.record.isMultiselect && csv.addColumn('isMultiselect')) changes.push({ file: `src/source/${names.propertyFile}`, note: 'added column isMultiselect' });
    const oldLine = csv.lines[row.index];
    const record: CsvInput = { ...row.record, ...after.record };
    let newLine = csv.replaceLine(row.index, record);
    if (newLine === oldLine) throw new ValidationError(`Nothing changes for ${id}.`);

    // A part that moves to another composite is moved below its new parent.
    let line = row.index + 1;
    if (record.broaderPartitive && record.broaderPartitive !== row.record.broaderPartitive) {
        csv.removeLines([row.index]);
        const position = partPosition(csv, record.broaderPartitive);
        [newLine] = csv.insertAfter(position, [record]);
        line = position + 2;
    }
    changes.unshift({ file: `src/source/${names.propertyFile}`, line, before: oldLine, after: newLine });
    if (!dryRun) csv.save();
    return writeResult({ action: `update eigenschap ${id}`, changes, warnings, dryRun });
}

export function deleteProperty(
    { system, property, deleteUnusedLists = false, dryRun = true }: { system: string; property: string; deleteUnusedLists?: boolean; dryRun?: boolean },
): WriteResult {
    const names = systemNames(system);
    const csv = openCsv(names.propertyFile);
    const id = toId(property, names.propertyPrefix);
    const row = conceptRow(csv, id);
    if (!row || row.record.inScheme !== names.propertyScheme) throw new ValidationError(`${id} is not an eigenschap in ${names.propertyFile}.`);

    // A composite is deleted together with its parts.
    const rows = [row, ...csv.rows.filter(r => !r.blank && r.record.broaderPartitive === id)];
    const deleted = new Set(rows.map(r => r.index));
    const isDeleted = (file: string, index: number) => file === names.propertyFile && deleted.has(index);
    const references = findReferences(rows.map(r => r.record._id), { ignore: ({ file, row: r }) => isDeleted(file, r.index) });
    fail(references.length ? [`${id} is still referenced; change these rows first:\n${describeReferences(references)}`] : []);

    // Inline lists that no other row uses once these rows are gone.
    const warnings = ['After publication the eigenschap is marked adms:status Withdrawn by the versioning step of generate_skos.'];
    const usedLists = [...new Set(rows.flatMap(r => [...splitValues(r.record.relevantCodeList), ...splitValues(r.record.relevantUnit)]))]
        .filter(listId => describeList(csv, listId));
    const orphaned = usedLists.filter(listId => findReferences([listId], {
        ignore: ({ file, row: r, column }) => isDeleted(file, r.index) || (file === names.propertyFile && isOwnListRow(r.record, column, listId)),
    }).length === 0);

    const lineIndexes = [...deleted];
    let changes: LineChange[] = [];
    if (orphaned.length && deleteUnusedLists) {
        for (const listId of orphaned) {
            const { remove, edit } = listRowIndexes(csv, listId);
            lineIndexes.push(...remove);
            changes = changes.concat(applyMembershipEdits(csv, names, edit));
        }
    } else if (orphaned.length) {
        warnings.push(`These inline lists are no longer used after this delete: ${orphaned.join(', ')}. Pass deleteUnusedLists=true to delete them too, or delete them with delete_selection_list.`);
    }
    changes.push({ file: `src/source/${names.propertyFile}`, removed: csv.removeLines(lineIndexes) });
    if (!dryRun) csv.save();
    const parts = rows.length - 1;
    return writeResult({ action: `delete eigenschap ${id}${parts ? ` with ${parts} part(s)` : ''}`, changes, warnings, dryRun });
}
