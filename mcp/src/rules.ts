// Shared conventions and checks for the code lists.

import type { CsvFile } from './csv.js';
import { isDeclaredPrefix, isUrl, prefixOf } from './repo.js';

export const DATATYPES = ['xsd:string', 'xsd:decimal', 'xsd:integer', 'xsd:boolean', 'xsd:date', 'xsd:dateTime', 'xsd:duration'] as const;
export type Datatype = (typeof DATATYPES)[number];
export const NUMERIC_DATATYPES: readonly string[] = ['xsd:decimal', 'xsd:integer'];

// Relations used for eigenschappen so far: rdfs:value for the value itself,
// rdfs:label for a name, riepr:parameter for the measured substance and
// riepr:inGebruikVan for a "since" date.
export const KNOWN_RELATIONS = ['rdfs:value', 'rdfs:label', 'rdfs:comment', 'riepr:parameter', 'riepr:inGebruikVan'];

export const LIST_TYPES = ['skos:ConceptScheme', 'skos:Collection'];

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

/** A rule violation; nothing has been written when this is thrown. */
export class ValidationError extends Error {}

export interface Problems {
    errors: string[];
    warnings: string[];
}

export function fail(errors: string[]): void {
    if (errors.length > 0) throw new ValidationError(errors.join('\n'));
}

/** Accepts either a bare code ("stookinstallatie") or a CURIE ("installatie:stookinstallatie"). */
export function toId(value: string, prefix: string): string {
    const trimmed = value.trim();
    return trimmed.includes(':') ? trimmed : `${prefix}:${trimmed}`;
}

export function checkCode(code: string, label: string, errors: string[]): void {
    if (!CODE_PATTERN.test(code)) {
        errors.push(`${label} '${code}' must be lowercase snake_case (a-z, 0-9, _), e.g. 'directe_stookinstallatie'.`);
    }
}

export function checkTexts(
    { prefLabel, definition }: { prefLabel?: string; definition?: string },
    errors: string[],
    warnings: string[],
): void {
    const label = prefLabel?.trim();
    if (!label) errors.push('prefLabel is required.');
    else if (label[0] !== label[0].toLocaleUpperCase('nl')) {
        errors.push(`prefLabel '${prefLabel}' must start with a capital letter.`);
    }
    if (definition !== undefined) {
        if (!definition.trim()) errors.push('definition is required: write one full Dutch sentence.');
        else if (!/[.!?]$/.test(definition.trim())) warnings.push(`definition should be a full sentence ending with a period: '${definition}'.`);
    }
}

export function checkReference(value: string, field: string, errors: string[]): void {
    if (isUrl(value)) return;
    const prefix = prefixOf(value);
    if (!prefix) errors.push(`${field} '${value}' is neither a CURIE nor an http(s) URL.`);
    else if (!isDeclaredPrefix(prefix)) {
        errors.push(`${field} '${value}' uses prefix '${prefix}:' which is not declared in src/source/config.yml.`);
    }
}

export function flag(value: boolean | undefined): string {
    return value ? 'true' : '';
}

/** Index of the last row of the first block (rows before the first blank separator row). */
export function firstBlockEnd(csv: CsvFile): number {
    let end = 0;
    for (const row of csv.rows) {
        if (row.blank) break;
        end = row.index;
    }
    return end;
}

/** One changed line (or a set of removed lines) in a source file. */
export interface LineChange {
    file: string;
    line?: number;
    before?: string;
    after?: string;
    removed?: string[];
    note?: string;
}

export interface WriteDetails {
    /** File that received insertedLines. */
    file?: string;
    insertedLines?: string[];
    /** Edits and deletions. */
    changes?: LineChange[];
    /** Side effects such as added columns or declared prefixes. */
    otherChanges?: string[];
    /** Id of a created selection list, and how to use it. */
    codeListId?: string;
    use?: string;
}

export interface WriteResult extends WriteDetails {
    status: string;
    action: string;
    warnings: string[];
    next: string;
}

export function writeResult(
    { action, dryRun, warnings = [], ...details }: WriteDetails & { action: string; dryRun: boolean; warnings?: string[] },
): WriteResult {
    return {
        status: dryRun ? 'dry-run (nothing written)' : 'written',
        action,
        ...details,
        warnings,
        next: dryRun
            ? 'Show the preview to the user and call again with dryRun=false once confirmed.'
            : 'Written without generator validation; run generate_skos.',
    };
}
