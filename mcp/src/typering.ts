// Detects eigenschappen and selection lists that are really a typering: a choice
// between kinds of the system itself ("Type emissiepunt": schoorsteen, fakkel, ...)
// belongs in <systeem>_type.csv as subtypes, not in a
// selection eigenschap.

import fs from 'node:fs';
import path from 'node:path';
import { openCsv, repoRoot, type SystemNames } from './repo.js';

const OUTPUT_TTL = 'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.ttl';
const TYPE_WORDS = ['type', 'typering', 'soort', 'categorie'];

interface KnownType {
    id: string;
    code: string;
    label?: string;
    withdrawn?: boolean;
}

/** Lowercase, without diacritics and with words separated by single spaces. */
function words(text: string | undefined): string {
    return (text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Types of the system, including published types that were deleted since (adms:status Withdrawn in the output). */
function knownTypes(names: SystemNames, root = repoRoot()): KnownType[] {
    const types: KnownType[] = openCsv(names.typeFile, root).records
        .filter(r => r._type === 'skos:Concept')
        .map(r => ({ id: r._id, code: r._id.slice(names.typePrefix.length + 1), label: r.prefLabel }));
    const ttl = path.join(root, OUTPUT_TTL);
    if (fs.existsSync(ttl)) {
        const subject = new RegExp(`^${names.typePrefix}:([a-zA-Z0-9_-]+) `);
        let current: string | undefined;
        for (const line of fs.readFileSync(ttl, 'utf8').split('\n')) {
            const match = subject.exec(line);
            if (match) current = match[1];
            else if (/^\S/.test(line)) current = undefined;
            if (current && line.includes('adms/status/Withdrawn') && !types.some(t => t.code === current)) {
                types.push({ id: `${names.typePrefix}:${current}`, code: current, withdrawn: true });
            }
        }
    }
    return types;
}

/** The subject of "Type stookinstallatie" / "soort_emissiepunt" / "emissiepunt_type", if any. */
function typeSubject(prefLabel: string | undefined, code: string | undefined): string[] {
    const subjects: string[] = [];
    const pattern = new RegExp(`^(?:${TYPE_WORDS.join('|')}) (?:van )?(?:het |de |een )?(.+)$`);
    for (const text of [words(prefLabel), words(code)]) {
        const leading = pattern.exec(text);
        if (leading) subjects.push(leading[1]);
        const trailing = new RegExp(`^(.+) (?:${TYPE_WORDS.join('|')})$`).exec(text);
        if (trailing) subjects.push(trailing[1]);
    }
    return subjects;
}

function refersTo(subject: string, type: KnownType): boolean {
    const typeWords = new Set([...words(type.code).split(' '), ...words(type.label).split(' ')]);
    return words(type.code) === subject || words(type.label) === subject || subject.split(' ').every(w => typeWords.has(w));
}

function advice(names: SystemNames, parent: string | undefined): string {
    const broader = parent ? `broader=${parent}` : 'broader=<the type they are kinds of>';
    return `Model the options as subtypes in ${names.typeFile} with add_type (${broader}) instead of a selection eigenschap.`;
}

/** Options of a selection list that are (or were) types of the system. */
export function optionsThatAreTypes(
    names: SystemNames,
    options: Array<{ id?: string; code?: string; prefLabel?: string }>,
    root = repoRoot(),
): string[] {
    const types = knownTypes(names, root);
    const found: string[] = [];
    for (const option of options) {
        const code = option.code ?? option.id?.split(':')[1];
        const type = types.find(t => words(t.code) === words(code) || (t.label && words(t.label) === words(option.prefLabel)));
        if (type) found.push(`'${option.prefLabel ?? code}' is the type ${type.id}${type.withdrawn ? ' (published, now withdrawn)' : ''}`);
    }
    return found;
}

/**
 * Problems of an eigenschap that is really a typering of the system. Errors for a
 * selection (codeList), warnings for free text, which may describe the kind too.
 */
export function typeringProblems(
    names: SystemNames,
    { id, prefLabel, code, appliesTo, hasCodeList, options = [] }: {
        id: string; prefLabel?: string; code?: string; appliesTo: string[]; hasCodeList: boolean;
        options?: Array<{ id?: string; code?: string; prefLabel?: string }>;
    },
    root = repoRoot(),
): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const types = knownTypes(names, root);
    const parent = appliesTo.find(t => t !== names.typeScheme);

    for (const subject of typeSubject(prefLabel, code)) {
        // "Type emissiepunt" is about the system itself; otherwise prefer an exact match over a partial one.
        const system = words(names.system) === subject;
        const candidates = system ? [] : types.filter(t => !t.withdrawn && refersTo(subject, t));
        const type = candidates.find(t => words(t.code) === subject || words(t.label) === subject) ?? candidates[0];
        if (!system && !type) continue;
        const what = system ? `a kind of ${names.system}` : `a kind of ${type!.id}`;
        const message = `${id} ('${prefLabel}') looks like a typering: it selects ${what}.`;
        if (hasCodeList) errors.push(`${message} ${advice(names, type?.id ?? parent)}`);
        else warnings.push(`${message} If the possible values are kinds of ${type?.id ?? names.system}, add them as subtypes instead.`);
        break;
    }

    const overlap = optionsThatAreTypes(names, options, root);
    if (overlap.length) errors.push(`${id} offers types of ${names.typeFile} as options (${overlap.join('; ')}). ${advice(names, parent)}`);
    return { errors: [...new Set(errors)], warnings };
}

