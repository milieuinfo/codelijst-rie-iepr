import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { repoRoot } from './repo.js';

const execute = promisify(execFile);
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/reporting-preview.mjs');

export async function getReportingPreview({ flow, section }: { flow?: string; section?: string }) {
    if (section !== undefined && flow === undefined) throw new Error('Select a reporting entry before filtering a section.');
    const args = [script, repoRoot(), ...(flow === undefined ? [] : [flow]), ...(section === undefined ? [] : [section])];
    const { stdout } = await execute(process.execPath, args, { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(stdout) as unknown;
}
