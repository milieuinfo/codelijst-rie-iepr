// Runs the real generator (`npm run generate_skos`) to validate changes, and
// rolls a change back when the generator fails.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, repoRoot, sourceDir } from './repo.js';

const TIMEOUT_MS = 5 * 60 * 1000;

export interface Generation {
    ok: boolean;
    exitCode: number | null;
    durationMs: number;
    output: string;
    summary: string;
}

export interface CsvFixResult {
    ok: boolean;
    exitCode: number | null;
    durationMs: number;
    output: string;
    summary: string;
    fixedLines: string[];
}

export function runCsvFix(root = repoRoot()): Promise<CsvFixResult> {
    return new Promise(resolve => {
        const started = Date.now();
        const child = spawn('npm', ['run', 'csv:fix'], { cwd: root, env: process.env });
        let output = '';
        child.stdout.on('data', (chunk: Buffer) => { output += chunk; });
        child.stderr.on('data', (chunk: Buffer) => { output += chunk; });
        const timer = setTimeout(() => {
            output += `\nTimed out after ${TIMEOUT_MS / 1000}s.`;
            child.kill('SIGTERM');
        }, TIMEOUT_MS);
        child.on('error', error => { output += `\n${error.message}`; });
        child.on('close', exitCode => {
            clearTimeout(timer);
            const ok = exitCode === 0;
            const fixedLines = output.split('\n').filter(l => l.includes('line') && l.includes('columns') && l.includes('fixed'));
            resolve({ ok, exitCode, durationMs: Date.now() - started, output, summary: summarize(output, ok), fixedLines });
        });
    });
}

export function runGenerateSkos(root = repoRoot()): Promise<Generation> {
    return new Promise(resolve => {
        const started = Date.now();
        const child = spawn('npm', ['run', 'generate_skos'], { cwd: root, env: process.env });
        let output = '';
        child.stdout.on('data', (chunk: Buffer) => { output += chunk; });
        child.stderr.on('data', (chunk: Buffer) => { output += chunk; });
        const timer = setTimeout(() => {
            output += `\nTimed out after ${TIMEOUT_MS / 1000}s.`;
            child.kill('SIGTERM');
        }, TIMEOUT_MS);
        child.on('error', error => { output += `\n${error.message}`; });
        child.on('close', exitCode => {
            clearTimeout(timer);
            const ok = exitCode === 0;
            resolve({ ok, exitCode, durationMs: Date.now() - started, output, summary: summarize(output, ok) });
        });
    });
}

/** The generator's output is long (versioning diff, ...); keep what explains the result. */
function summarize(output: string, ok: boolean): string {
    const lines = output.split('\n').filter(l => !/DeprecationWarning|--trace-deprecation/.test(l));
    if (ok) return lines.filter(l => /Validation succeeded|written to/.test(l)).join('\n');
    const start = lines.findIndex(l => /^=== |Error|error/.test(l));
    return lines.slice(start >= 0 ? start : -60).slice(0, 80).join('\n');
}

/** Files that a write tool or the generator may change. */
function trackedPaths(root: string) {
    const config = loadConfig(root);
    const generated = path.resolve(root, 'src', config.skos.path, config.skos.name);
    return {
        dirs: [sourceDir(root), generated],
        files: [path.join(root, 'README.md'), path.join(root, 'validation', 'validation_result.json')],
    };
}

function listFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(full) : [full];
    });
}

export interface Snapshot {
    dirs: string[];
    contents: Map<string, Buffer | null>;
}

export function snapshot(root = repoRoot()): Snapshot {
    const { dirs, files } = trackedPaths(root);
    const contents = new Map<string, Buffer | null>();
    for (const file of [...dirs.flatMap(listFiles), ...files]) {
        contents.set(file, fs.existsSync(file) ? fs.readFileSync(file) : null);
    }
    return { dirs, contents };
}

export function restore({ dirs, contents }: Snapshot): void {
    for (const file of dirs.flatMap(listFiles)) {
        if (!contents.has(file)) fs.rmSync(file);
    }
    for (const [file, content] of contents) {
        if (content === null) fs.rmSync(file, { force: true });
        else fs.writeFileSync(file, content);
    }
}

export class GenerationError extends Error {
    readonly generation: Generation;

    constructor(message: string, generation: Generation) {
        super(message);
        this.generation = generation;
    }
}

/**
 * Applies a write, then validates it with the generator. On failure every
 * tracked file is restored to its state before the write.
 */
export async function validatedWrite<T>(
    write: () => T | Promise<T>,
    { root = repoRoot(), generate = runGenerateSkos, csvFix = runCsvFix }: { root?: string; generate?: (root: string) => Promise<Generation>; csvFix?: (root: string) => Promise<CsvFixResult> } = {},
) {
    const before = snapshot(root);
    let value: T;
    try {
        value = await write();
    } catch (error) {
        restore(before);
        throw error;
    }
    const csvResult = await csvFix(root);
    if (!csvResult.ok) {
        restore(before);
        throw new Error(`npm run csv:fix failed (exit ${csvResult.exitCode}); the change was rolled back.\n\n${csvResult.summary}`);
    }
    const generation = await generate(root);
    if (!generation.ok) {
        restore(before);
        throw new GenerationError(
            `npm run generate_skos failed (exit ${generation.exitCode}); the change was rolled back.\n\n${generation.summary}`,
            generation,
        );
    }
    return {
        ...(typeof value === 'object' && value !== null ? value : {}),
        status: 'written, csv fixed and validated with npm run generate_skos',
        csvFix: { ok: true, durationMs: csvResult.durationMs, summary: csvResult.summary, fixedLines: csvResult.fixedLines },
        generateSkos: { ok: true, durationMs: generation.durationMs, summary: generation.summary },
        next: 'Run validate_codelists for warnings, then review the diff (sources and regenerated output) with the user.',
    };
}
