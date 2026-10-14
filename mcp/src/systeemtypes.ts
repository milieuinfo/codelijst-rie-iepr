// Systeemtypes: src/source/<systeem>_type.csv.

import type { CsvFile, CsvInput } from './csv.js';
import { assertNoRename, describeReferences, findReferences, conceptRow, merge, newProblems, type Changes, type LineChange } from './references.js';
import { conceptIndex, openCsv, splitValues, systemNames, type SystemNames } from './repo.js';
import {
    checkCode, checkTexts, fail, firstBlockEnd, flag, toId, ValidationError, writeResult, type Problems, type WriteResult,
} from './rules.js';

export interface TypeFields {
    code: string;
    prefLabel: string;
    definition: string;
    altLabel?: string;
    scopeNote?: string;
    broader?: string;
    isOnzichtbaar?: boolean;
    isMeetbaar?: boolean;
}

export type EditableTypeFields = Omit<TypeFields, 'code'>;

export function listTypes(system: string) {
    const names = systemNames(system);
    const csv = openCsv(names.typeFile);
    return {
        file: `src/source/${names.typeFile}`,
        conceptScheme: names.typeScheme,
        prefix: `${names.typePrefix}:`,
        columns: csv.header,
        types: csv.records.filter(r => r._type === 'skos:Concept').map(r => ({
            id: r._id,
            prefLabel: r.prefLabel,
            definition: r.definition || undefined,
            broader: r.broader || undefined,
            isOnzichtbaar: r.isOnzichtbaar || undefined,
            isMeetbaar: r.isMeetbaar || undefined,
        })),
    };
}

/**
 * Validates type fields and builds the CSV record. `existingId` is set when
 * editing, so the type does not conflict with itself.
 */
export function buildType(
    fields: TypeFields,
    { names, csv, existingId }: { names: SystemNames; csv: CsvFile; existingId?: string },
): Problems & { record: CsvInput } {
    const { code, prefLabel, definition, altLabel, scopeNote, broader, isOnzichtbaar = false, isMeetbaar = true } = fields;
    const errors: string[] = [];
    const warnings: string[] = [];

    checkCode(code, 'code', errors);
    checkTexts({ prefLabel, definition: definition ?? '' }, errors, warnings);
    const id = `${names.typePrefix}:${code}`;
    const records = csv.records;
    if (id !== existingId && conceptIndex().has(id)) errors.push(`${id} already exists.`);
    const sameLabel = records.find(r => r._id !== id && r.prefLabel?.toLowerCase() === prefLabel?.trim().toLowerCase());
    if (sameLabel) errors.push(`prefLabel '${prefLabel}' is already used by ${sameLabel._id}.`);

    let broaderId: string | undefined;
    if (broader) {
        broaderId = toId(broader, names.typePrefix);
        if (!records.some(r => r._id === broaderId && r._type === 'skos:Concept')) {
            errors.push(`broader '${broaderId}' is not a type in ${names.typeFile}.`);
        }
        // A type cannot be placed below itself or one of its own subtypes.
        let current: string | undefined = broaderId;
        const seen = new Set<string>();
        while (current && !seen.has(current)) {
            if (current === id) {
                errors.push(`broader '${broaderId}' would make ${id} a subtype of itself.`);
                break;
            }
            seen.add(current);
            current = records.find(r => r._id === current)?.broader;
        }
    }

    const record: CsvInput = {
        _id: id,
        _type: 'skos:Concept',
        topConceptOf: broaderId ? '' : names.typeScheme,
        inScheme: names.typeScheme,
        prefLabel: prefLabel?.trim(),
        altLabel,
        definition: definition?.trim(),
        scopeNote,
        broader: broaderId,
        isOnzichtbaar: flag(isOnzichtbaar),
        isMeetbaar: flag(isMeetbaar),
    };
    return { record, errors, warnings };
}

export function addType(params: TypeFields & { system: string; dryRun?: boolean }): WriteResult {
    const { system, dryRun = true } = params;
    const names = systemNames(system);
    const csv = openCsv(names.typeFile);
    const { record, errors, warnings } = buildType(params, { names, csv });
    fail(errors);

    // Keep subtypes grouped below their broader type.
    let after = firstBlockEnd(csv);
    if (record.broader) {
        const descendants = new Set([record.broader]);
        for (const row of csv.rows) {
            if (row.blank) break;
            if (descendants.has(row.record._id) || descendants.has(row.record.broader)) {
                descendants.add(row.record._id);
                after = row.index;
            }
        }
    }
    const lines = csv.insertAfter(after, [record]);
    if (!dryRun) csv.save();
    return writeResult({ action: `add type ${record._id}`, file: `src/source/${names.typeFile}`, insertedLines: lines, warnings, dryRun });
}

function typeFields(record: Record<string, string>, names: SystemNames): TypeFields {
    return {
        code: record._id.slice(names.typePrefix.length + 1),
        prefLabel: record.prefLabel,
        definition: record.definition,
        altLabel: record.altLabel || undefined,
        scopeNote: record.scopeNote || undefined,
        broader: record.broader || undefined,
        isOnzichtbaar: record.isOnzichtbaar === 'true',
        isMeetbaar: record.isMeetbaar === 'true',
    };
}

export function updateType(
    { system, type, set, dryRun = true }: { system: string; type: string; set: Changes<EditableTypeFields>; dryRun?: boolean },
): WriteResult {
    const names = systemNames(system);
    const csv = openCsv(names.typeFile);
    const id = toId(type, names.typePrefix);
    const row = conceptRow(csv, id);
    if (!row || row.record._type !== 'skos:Concept') throw new ValidationError(`${id} is not a type in ${names.typeFile}.`);
    assertNoRename(set, 'type');

    const current = typeFields(row.record, names);
    const before = buildType(current, { names, csv, existingId: id });
    const after = buildType(merge(current, set), { names, csv, existingId: id });
    const { errors, warnings } = newProblems(before, after);
    fail(errors);

    const oldLine = csv.lines[row.index];
    const newLine = csv.replaceLine(row.index, { ...row.record, ...after.record });
    if (newLine === oldLine) throw new ValidationError(`Nothing changes for ${id}.`);
    if (!dryRun) csv.save();
    const changes: LineChange[] = [{ file: `src/source/${names.typeFile}`, line: row.index + 1, before: oldLine, after: newLine }];
    return writeResult({ action: `update type ${id}`, changes, warnings, dryRun });
}

export function deleteType(
    { system, type, removeFromProperties = false, dryRun = true }: { system: string; type: string; removeFromProperties?: boolean; dryRun?: boolean },
): WriteResult {
    const names = systemNames(system);
    const typeCsv = openCsv(names.typeFile);
    const propertyCsv = openCsv(names.propertyFile);
    const id = toId(type, names.typePrefix);
    const row = conceptRow(typeCsv, id);
    if (!row || row.record._type !== 'skos:Concept') throw new ValidationError(`${id} is not a type in ${names.typeFile}.`);

    const errors: string[] = [];
    const subtypes = typeCsv.records.filter(r => r.broader === id);
    if (subtypes.length) {
        errors.push(`${id} has subtypes (${subtypes.map(s => s._id).join(', ')}); delete them or give them another broader type first.`);
    }

    const references = findReferences([id]);
    const inProperties = references.filter(r => r.file.endsWith(`/${names.propertyFile}`) && r.column === 'relevantRiepr');
    const elsewhere = references.filter(r => !inProperties.includes(r) && !(r.file.endsWith(`/${names.typeFile}`) && r.column === 'broader'));
    if (elsewhere.length) {
        errors.push(`${id} is still referenced outside ${names.propertyFile}; change these rows by hand first:\n${describeReferences(elsewhere)}`);
    }
    const changes: LineChange[] = [];
    if (inProperties.length && !removeFromProperties) {
        errors.push(
            `${id} is used in relevantRiepr of these eigenschappen:\n${describeReferences(inProperties)}\n` +
            'Pass removeFromProperties=true to remove the type from them (after confirming with the user), or update/delete those eigenschappen first.',
        );
    } else {
        for (const reference of inProperties) {
            const propertyRow = propertyCsv.rows.find(r => r.index + 1 === reference.line);
            if (!propertyRow) continue;
            const remaining = splitValues(propertyRow.record.relevantRiepr).filter(v => v !== id);
            if (remaining.length === 0 && !propertyRow.record.broaderPartitive) {
                errors.push(`${propertyRow.record._id} applies only to ${id}; delete that eigenschap or point it to another type first.`);
                continue;
            }
            const before = propertyCsv.lines[propertyRow.index];
            const after = propertyCsv.replaceLine(propertyRow.index, { ...propertyRow.record, relevantRiepr: remaining.join('|') });
            changes.push({ file: `src/source/${names.propertyFile}`, line: propertyRow.index + 1, before, after });
        }
    }
    fail(errors);

    const removed = typeCsv.removeLines([row.index]);
    changes.unshift({ file: `src/source/${names.typeFile}`, line: row.index + 1, removed });
    if (!dryRun) {
        typeCsv.save();
        propertyCsv.save();
    }
    return writeResult({
        action: `delete type ${id}`,
        changes,
        warnings: ['After publication the type is marked adms:status Withdrawn by the versioning step of generate_skos.'],
        dryRun,
    });
}
