// Quick structural checks of the type and eigenschappen CSVs. The full check is
// `npm run generate_skos` (see pipeline.ts).

import type { CsvFile } from './csv.js';
import { isDeclaredPrefix, openCsv, prefixOf, splitValues, systemNames, type System } from './repo.js';
import { NUMERIC_DATATYPES } from './rules.js';

export interface Issue {
    level: 'error' | 'warning';
    location: string;
    message: string;
}

export function validate(systems: readonly System[]) {
    const issues: Issue[] = [];
    const report = (level: Issue['level'], file: string, line: number, message: string) =>
        issues.push({ level, location: `src/source/${file}:${line}`, message });

    for (const system of systems) {
        const names = systemNames(system);
        const typeCsv = openCsv(names.typeFile);
        const propCsv = openCsv(names.propertyFile);
        const typeIds = new Set(typeCsv.records.map(r => r._id));

        const files: Array<[CsvFile, string]> = [[typeCsv, names.typeFile], [propCsv, names.propertyFile]];
        for (const [csv, file] of files) {
            const seen = new Map<string, number>();
            for (const row of csv.rows) {
                const line = row.index + 1;
                const r = row.record;
                if (row.columnCount !== csv.header.length) report('error', file, line, `has ${row.columnCount} columns, expected ${csv.header.length} (run \`npm run csv:fix\`).`);
                if (row.blank) continue;
                if (r._type) {
                    if (seen.has(r._id)) report('error', file, line, `duplicate _id ${r._id} (also on line ${seen.get(r._id)}).`);
                    seen.set(r._id, line);
                }
                for (const [column, value] of Object.entries(r)) {
                    for (const part of splitValues(value)) {
                        const prefix = prefixOf(part);
                        if (prefix && /^[a-zA-Z0-9_/.:-]+$/.test(part.slice(prefix.length + 1)) && !isDeclaredPrefix(prefix)) {
                            report('error', file, line, `${column}: prefix '${prefix}:' is not declared in config.yml.`);
                        }
                    }
                }
            }
        }

        for (const row of typeCsv.rows.filter(r => !r.blank && r.record._type === 'skos:Concept')) {
            const r = row.record;
            const line = row.index + 1;
            if (r.broader && !typeIds.has(r.broader)) report('error', names.typeFile, line, `broader ${r.broader} does not exist.`);
            if (Boolean(r.broader) === Boolean(r.topConceptOf)) report('warning', names.typeFile, line, 'a type has either topConceptOf (top level) or broader (subtype), not both/neither.');
            if (!r.definition) report('warning', names.typeFile, line, `${r._id} has no definition.`);
        }

        const propRecords = propCsv.records;
        const propIds = new Set(propRecords.map(r => r._id));
        for (const row of propCsv.rows.filter(r => !r.blank)) {
            const r = row.record;
            const line = row.index + 1;
            if (r.inScheme !== names.propertyScheme) {
                for (const c of splitValues(r.collections)) {
                    if (!propIds.has(c)) report('error', names.propertyFile, line, `collection ${c} is not defined in this file.`);
                }
                continue;
            }
            const isComposite = propRecords.some(c => c.broaderPartitive === r._id);
            if (r.broaderPartitive && !propIds.has(r.broaderPartitive)) report('error', names.propertyFile, line, `broaderPartitive ${r.broaderPartitive} does not exist.`);
            if (Boolean(r.broaderPartitive) === Boolean(r.topConceptOf)) report('warning', names.propertyFile, line, 'a property has either topConceptOf (top level) or broaderPartitive (part of a composite), not both/neither.');
            for (const t of splitValues(r.relevantRiepr)) {
                if (t !== names.typeScheme && !typeIds.has(t)) report('error', names.propertyFile, line, `relevantRiepr ${t} is not a type in ${names.typeFile}.`);
            }
            if (!r.broaderPartitive && !r.relevantRiepr && !(isComposite && propRecords.some(c => c.broaderPartitive === r._id && c.relevantRiepr))) {
                report('warning', names.propertyFile, line, `${r._id} has no relevantRiepr, so it applies to no type.`);
            }
            if (!isComposite && !r.relevantDataType && !r.relevantCodeList) report('warning', names.propertyFile, line, `${r._id} has neither relevantDataType nor relevantCodeList.`);
            if (r.relevantUnit && !NUMERIC_DATATYPES.includes(r.relevantDataType)) report('warning', names.propertyFile, line, `${r._id} has a unit but datatype '${r.relevantDataType || '(none)'}'.`);
            if (!r.definition) report('warning', names.propertyFile, line, `${r._id} has no definition.`);
        }
    }

    return {
        errors: issues.filter(i => i.level === 'error').length,
        warnings: issues.filter(i => i.level === 'warning').length,
        issues,
    };
}
