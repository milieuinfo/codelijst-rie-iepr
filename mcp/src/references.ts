// Helpers for editing and deleting existing rows.
//
// Deleting a row is how a concept is withdrawn: `generate_skos` compares the
// graph with the previous release and publishes removed concepts with
// adms:status Withdrawn; edited concepts get dct:modified/dct:isVersionOf.

import type { CsvFile, CsvRow } from './csv.js';
import { openCsv, sourceCsvFiles, splitValues } from './repo.js';
import { ValidationError, type Problems } from './rules.js';

export type { LineChange } from './rules.js';

export interface Reference {
    id: string;
    file: string;
    line: number;
    column: string;
    rowId?: string;
}

export interface ReferenceContext {
    /** Source CSV file name, e.g. "installatie_eigenschappen.csv". */
    file: string;
    row: CsvRow;
    column: string;
    id: string;
}

/** Every cell (other than _id) in the configured source CSVs that mentions one of `ids`. */
export function findReferences(ids: string[], { ignore = () => false }: { ignore?: (context: ReferenceContext) => boolean } = {}): Reference[] {
    const wanted = new Set(ids);
    const references: Reference[] = [];
    for (const file of sourceCsvFiles()) {
        let csv: CsvFile;
        try {
            csv = openCsv(file);
        } catch {
            continue;
        }
        for (const row of csv.rows.filter(r => !r.blank)) {
            for (const [column, value] of Object.entries(row.record)) {
                if (column === '_id') continue;
                for (const id of splitValues(value).filter(v => wanted.has(v))) {
                    if (!ignore({ file, row, column, id })) {
                        references.push({ id, file: `src/source/${file}`, line: row.index + 1, column, rowId: row.record._id || undefined });
                    }
                }
            }
        }
    }
    return references;
}

export function describeReferences(references: Reference[]): string {
    return references.map(r => `  - ${r.file}:${r.line} ${r.rowId ?? '(row)'} [${r.column}] → ${r.id}`).join('\n');
}

/** The row that defines `id` (member rows of collections have no _type). */
export function conceptRow(csv: CsvFile, id: string): CsvRow | undefined {
    return csv.rows.find(r => !r.blank && r.record._id === id && Boolean(r.record._type));
}

/** The code is part of the published URI, so edits never change it. */
export function assertNoRename(set: object, what: string): void {
    if ('code' in set || '_id' in set) {
        throw new ValidationError(`The code is part of the published URI and cannot be changed; add a new ${what} and delete this one instead.`);
    }
}

/** Field updates: `null` clears a field, `undefined` keeps the current value. */
export type Changes<T> = { [K in keyof T]?: T[K] | null };

export function merge<T extends object>(current: T, set: NoInfer<Changes<T>> = {}): T {
    const merged = { ...current } as Record<string, unknown>;
    for (const [key, value] of Object.entries(set)) {
        if (value === undefined) continue;
        const existing = (current as Record<string, unknown>)[key];
        merged[key] = value !== null ? value : Array.isArray(existing) ? [] : typeof existing === 'boolean' ? false : undefined;
    }
    return merged as T;
}

/**
 * Problems that already existed before an edit are reported as warnings, so
 * an old row with e.g. a missing definition can still get other fixes.
 */
export function newProblems(before: Problems, after: Problems): Problems {
    const existing = new Set(before.errors);
    return {
        errors: after.errors.filter(e => !existing.has(e)),
        warnings: [
            ...after.warnings,
            ...after.errors.filter(e => existing.has(e)).map(e => `pre-existing, not fixed by this edit: ${e}`),
        ],
    };
}
