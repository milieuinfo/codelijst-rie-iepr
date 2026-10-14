// Knowledge about the repository layout and naming conventions.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { CsvFile, type CsvRecord } from './csv.js';

export const SYSTEMS = ['emissiepunt', 'filter', 'installatie', 'meetpunt', 'uitwisselpunt', 'onttrekkingspunt'] as const;
export type System = (typeof SYSTEMS)[number];

export const CONCEPT_BASE = 'https://data.omgeving.vlaanderen.be/id/concept/riepr/';

// Prefixes resolved natively by the generator (see WELL_KNOWN_PREFIXES in
// src/01_codelijst_skos_from_csv.js); they need no declaration in config.yml.
export const WELL_KNOWN_PREFIXES = new Set([
    'rdf', 'rdfs', 'owl', 'skos', 'xkos', 'dc', 'dcterms', 'dcmitype', 'dcat', 'qb',
    'sdmx-attribute', 'sdmx-dimension', 'sdmx-measure', 'xsd', 'qudt', 'qudt-schema',
    'qudt-unit', 'unit', 'sosa', 'ssn', 'ssn-system', 'gml', 'gsp', 'locn', 'prov',
    'foaf', 'vcard', 'org', 'rov', 'adms', 'sh', 'time', 'dbo', 'schema', 'spdx', 'void', 'ssd',
]);

/** The parts of src/source/config.yml this server uses. */
export interface Config {
    skos: { prefixes?: Record<string, string>; path: string; name: string };
    prefixes?: Record<string, string>;
    source?: { codelijst_csv?: string[] };
}

/** File names, prefixes and concept schemes of one system. */
export interface SystemNames {
    system: System;
    typeFile: string;
    typePrefix: string;
    typeScheme: string;
    propertyFile: string;
    propertyPrefix: string;
    propertyScheme: string;
    selectionPrefix: string;
    selectionPrefixUri: string;
}

export interface IndexEntry {
    file: string;
    type: string;
    prefLabel: string;
    record: CsvRecord;
}

export function repoRoot(): string {
    if (process.env.CODELIJST_ROOT) return path.resolve(process.env.CODELIJST_ROOT);
    // src/ and dist/ both sit directly below mcp/.
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function sourceDir(root = repoRoot()): string {
    return path.join(root, 'src', 'source');
}

export function isSystem(value: string): value is System {
    return (SYSTEMS as readonly string[]).includes(value);
}

export function systemNames(system: string): SystemNames {
    if (!isSystem(system)) {
        throw new Error(`Unknown system '${system}'. Supported: ${SYSTEMS.join(', ')}`);
    }
    return {
        system,
        typeFile: `${system}_type.csv`,
        typePrefix: system,
        typeScheme: `conceptscheme:${system}_type`,
        propertyFile: `${system}_eigenschappen.csv`,
        propertyPrefix: `${system}-eigenschappen`,
        propertyScheme: `conceptscheme:${system}_eigenschappen`,
        selectionPrefix: `${system}-selectiemogelijkheden`,
        selectionPrefixUri: `${CONCEPT_BASE}${system}-eigenschappen-selectiemogelijkheden/`,
    };
}

export function openCsv(fileName: string, root = repoRoot()): CsvFile {
    return new CsvFile(path.join(sourceDir(root), fileName));
}

export function loadConfig(root = repoRoot()): Config {
    const file = path.join(sourceDir(root), 'config.yml');
    return loadYaml(fs.readFileSync(file, 'utf8')) as Config;
}

export function declaredPrefixes(root = repoRoot()): Record<string, string> {
    const config = loadConfig(root);
    return { ...(config.skos?.prefixes ?? {}), ...(config.prefixes ?? {}) };
}

export function sourceCsvFiles(root = repoRoot()): string[] {
    return loadConfig(root).source?.codelijst_csv ?? [];
}

export function prefixOf(curie: string | undefined): string | undefined {
    const match = /^([a-zA-Z][a-zA-Z0-9_-]*):(?!\/\/)/.exec(curie ?? '');
    return match ? match[1] : undefined;
}

export function isUrl(value: string | undefined): boolean {
    return /^https?:\/\//.test(value ?? '');
}

export function isDeclaredPrefix(prefix: string, root = repoRoot()): boolean {
    return WELL_KNOWN_PREFIXES.has(prefix) || Object.hasOwn(declaredPrefixes(root), prefix);
}

/** Splits a multi-valued cell the way the generator does ("a|b" or "a,b"). */
export function splitValues(value: string | undefined): string[] {
    if (!value) return [];
    return value.split(/[|,]/).map(v => v.trim()).filter(Boolean);
}

/** Every _id defined across the configured source CSVs, with its file and type. */
export function conceptIndex(root = repoRoot()): Map<string, IndexEntry[]> {
    const index = new Map<string, IndexEntry[]>();
    for (const fileName of sourceCsvFiles(root)) {
        const filePath = path.join(sourceDir(root), fileName);
        if (!fs.existsSync(filePath)) continue;
        for (const record of new CsvFile(filePath).records) {
            if (!record._id) continue;
            const entries = index.get(record._id) ?? [];
            entries.push({ file: fileName, type: record._type, prefLabel: record.prefLabel, record });
            index.set(record._id, entries);
        }
    }
    return index;
}

/**
 * Declares `<prefix>: <uri>` in config.yml next to the other codelijst prefixes
 * and adds the matching row to the prefix table in README.md.
 */
export function declarePrefix({ prefix, uri, after }: { prefix: string; uri: string; after: string }, root = repoRoot()): string[] {
    const changes: string[] = [];
    const configPath = path.join(sourceDir(root), 'config.yml');
    const configLines = fs.readFileSync(configPath, 'utf8').split('\n');
    const anchor = configLines.findIndex(l => l.startsWith(`  ${after}:`));
    if (anchor < 0) throw new Error(`Could not find prefix '${after}' in config.yml to insert '${prefix}' after.`);
    configLines.splice(anchor + 1, 0, `  ${prefix}: ${uri}`);
    fs.writeFileSync(configPath, configLines.join('\n'), 'utf8');
    changes.push(`src/source/config.yml: declared prefix ${prefix}: ${uri}`);

    const readmePath = path.join(root, 'README.md');
    if (fs.existsSync(readmePath)) {
        const readmeLines = fs.readFileSync(readmePath, 'utf8').split('\n');
        // Keep the prefix table ("| `prefix:` | `path/` |") sorted alphabetically.
        const tableRows = readmeLines.flatMap((line, index) => {
            const name = /^\| `([^`]+):` \|/.exec(line)?.[1];
            return name ? [{ index, name }] : [];
        });
        if (tableRows.length > 0) {
            const relative = uri.startsWith(CONCEPT_BASE) ? uri.slice(CONCEPT_BASE.length) : uri;
            const next = tableRows.find(r => r.name.localeCompare(prefix) > 0);
            const at = next ? next.index : tableRows[tableRows.length - 1].index + 1;
            readmeLines.splice(at, 0, `| \`${prefix}:\` | \`${relative}\` |`);
            fs.writeFileSync(readmePath, readmeLines.join('\n'), 'utf8');
            changes.push(`README.md: added ${prefix}: to the prefix table`);
        }
    }
    return changes;
}
