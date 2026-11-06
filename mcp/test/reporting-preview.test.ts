import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, test } from 'vitest';
import { updateFlowItem } from '../src/flows-edit.js';
import { getReportingPreview } from '../src/reporting.js';

const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(realRoot, 'scripts/reporting-preview.mjs');
let root: string;
let previous: string | undefined;
const preview = (section?: string) => JSON.parse(execFileSync(process.execPath,
    [script, root, 'Lucht', ...(section ? [section] : [])], { encoding: 'utf8', timeout: 120_000 }));

beforeEach(() => {
    previous = process.env.CODELIJST_ROOT;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-reporting-preview-'));
    for (const directory of ['src/source', 'poc/poc-json-schema/examples']) {
        fs.cpSync(path.join(realRoot, directory), path.join(root, directory), { recursive: true });
    }
    fs.copyFileSync(path.join(realRoot, 'poc/reporting-entries.json'), path.join(root, 'poc/reporting-entries.json'));
    const publication = 'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld';
    fs.mkdirSync(path.dirname(path.join(root, publication)), { recursive: true });
    fs.copyFileSync(path.join(realRoot, publication), path.join(root, publication));
    process.env.CODELIJST_ROOT = root;
});

afterEach(() => {
    if (previous === undefined) delete process.env.CODELIJST_ROOT;
    else process.env.CODELIJST_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
});

test('previews real air sheets and installation-first columns without writing source files', () => {
    const sourceFile = path.join(root, 'src/source/operationeel_lucht.csv');
    const before = fs.readFileSync(sourceFile, 'utf8');
    const report = preview();
    assert.equal(report.complete, true);
    assert.equal(report.sections.length, 5);
    assert.equal(fs.readFileSync(sourceFile, 'utf8'), before);
    assert.equal(fs.existsSync(path.join(root, 'poc/poc-json-schema/output')), false);
    const waste = report.sections.find((section: { label: string }) => section.label === 'Afvalproduct');
    assert.equal(waste.workbook, 'lucht-afvalproducten.ods');
    assert.deepEqual(waste.sheets[0].columns.slice(0, 3).map((column: { label: string }) => column.label),
        ['Installatie', 'Naam', 'Aard en/of samenstelling']);
    const units = waste.sheets[0].columns.find((column: { label: string }) => column.label === 'Eenheid');
    assert.equal(units.choices.length, 7);
    assert.deepEqual(waste.checks, { schema: true, tabular: true, blankTemplate: true, populatedRoundTrip: false });
    const emission = report.sections.find((section: { label: string }) => section.label === 'Emissie');
    assert.equal(emission.sheets[1].columns.filter((column: { parentKey?: string }) => column.parentKey).length, 2);
}, 120_000);

test('reports source errors for only the affected section using the shared compiler', () => {
    updateFlowItem({ id: 'lucht:afvalproduct_hoeveelheid', set: { relation: null }, dryRun: false });
    const report = preview();
    assert.equal(report.complete, false);
    const blocked = report.sections.filter((section: { ready: boolean }) => !section.ready);
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].label, 'Afvalproduct');
    assert.equal(blocked[0].stage, 'schema');
    assert.ok(blocked[0].issues.some((issue: { message: string }) => /relation/.test(issue.message)));
}, 120_000);

test('separately diagnoses missing workbook metadata instead of accepting a technical fallback', () => {
    updateFlowItem({ id: 'lucht:afvalproduct', set: { tableWorkbook: null, tableSheet: null }, dryRun: false });
    const report = preview('lucht:afvalproduct');
    assert.equal(report.complete, false);
    assert.equal(report.sections[0].checks.schema, true);
    assert.equal(report.sections[0].stage, 'tabular');
    assert.match(report.sections[0].issues[0].message, /missing _table_workbook/);
}, 120_000);

test('MCP adapter accepts declared entries and rejects unknown section filters explicitly', async () => {
    await assert.rejects(getReportingPreview({ flow: 'not-an-entry' }), /No declared reporting entry/);
    await assert.rejects(getReportingPreview({ section: 'lucht:afvalproduct' }), /Select a reporting entry/);
}, 120_000);
