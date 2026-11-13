import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, test } from 'vitest';
import { loadReportingEntries, reportingEntriesPath } from '../../scripts/reporting-entries.mjs';
import { getFlow, getStep, listFlows, validateFlows } from '../src/flows.js';
import { addField, addStep } from '../src/flows-edit.js';

const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let root: string;
let previous: string | undefined;
const manifest = () => path.join(root, reportingEntriesPath);

beforeEach(() => {
    previous = process.env.CODELIJST_ROOT;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-reporting-entries-'));
    fs.cpSync(path.join(realRoot, 'src/source'), path.join(root, 'src/source'), { recursive: true });
    fs.mkdirSync(path.dirname(manifest()), { recursive: true });
    fs.copyFileSync(path.join(realRoot, reportingEntriesPath), manifest());
    process.env.CODELIJST_ROOT = root;
});

afterEach(() => {
    if (previous === undefined) delete process.env.CODELIJST_ROOT;
    else process.env.CODELIJST_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
});

test('reports direct entries independently of thema navigation without claiming generation readiness', () => {
    const listed = listFlows();
    assert.deepEqual(listed.reportingEntries.map(entry => entry.schemeId),
        loadReportingEntries(root).map(entry => entry.schemeId));
    assert.ok(listed.reportingEntries.every(entry => entry.valid));
    const air = getFlow({ flow: 'Lucht' });
    assert.equal(air.reportingEntry?.schemeId, 'conceptscheme:operationeel_lucht');
    assert.match(air.outline, /^Rapporteringsingang: Lucht/);
    assert.equal(air.thema, undefined);
    assert.equal(getStep({ step: 'lucht' }).reportingEntry?.slug, 'lucht');
    const unreachable = listed.stepsNotReachableFromAThema!;
    assert.equal(unreachable.find(step => step.id === air.reportingEntry!.schemeId)?.reachableFromReportingEntry, true);
    const issues = validateFlows().issues;
    assert.ok(!issues.some(issue => /step conceptscheme:operationeel_(lucht|grondwater|water) is not reachable/.test(issue.message)));
    assert.ok(!issues.some(issue => /step conceptscheme:operationeel_zelfcontrole_(lucht|water) is not reachable/.test(issue.message)));
    assert.ok(!issues.some(issue => /step conceptscheme:operationeel_grondstoffen is not reachable/.test(issue.message)));
    assert.equal(getFlow({ flow: 'Grondstoffen' }).reportingEntry?.slug, 'grondstoffen');
});

test('an entry covers its navigation descendants but not unrelated steps', () => {
    addStep({ name: 'operationeel_lucht_extra', from: 'lucht:feature_bron', dryRun: false });
    addField({ step: 'lucht_extra', code: 'entry_detail', prefLabel: 'Detail', datatype: 'xsd:string', dryRun: false });
    assert.ok(listFlows().reportingEntries.find(entry => entry.slug === 'lucht')!.steps
        .some(step => step.id === 'conceptscheme:operationeel_lucht_extra'));
    assert.ok(!validateFlows().issues.some(issue =>
        /step conceptscheme:operationeel_lucht_extra is not reachable/.test(issue.message)));
});

test('invalid scheme/file mappings are errors, never silently active entries', () => {
    const entries = loadReportingEntries(root);
    entries[1].schemeId = 'conceptscheme:operationeel_contextueel';
    fs.writeFileSync(manifest(), JSON.stringify(entries));
    assert.equal(listFlows().reportingEntries[1].valid, false);
    assert.ok(validateFlows().issues.some(issue => issue.level === 'error' &&
        issue.location === reportingEntriesPath && issue.message.includes('operationeel_contextueel')));
    assert.throws(() => getFlow({ flow: 'lucht' }), /Invalid reporting entry/);
});

test('missing configuration means no optional direct entries for a navigation-only repository', () => {
    fs.unlinkSync(manifest());
    assert.deepEqual(listFlows().reportingEntries, []);
    assert.throws(() => loadReportingEntries(root), /ENOENT/);
    assert.ok(validateFlows().issues.some(issue =>
        /step conceptscheme:operationeel_lucht is not reachable/.test(issue.message)));
});

test('malformed, empty, duplicate and unsafe manifest entries fail explicitly', () => {
    const entries = loadReportingEntries(root);
    for (const value of [
        {}, [], [{ ...entries[0], file: '../escape.csv' }],
        [{ ...entries[0], unknown: true }],
        [{ ...entries[0], schemeId: 'http://example.test/entry' }],
        [{ ...entries[0], slug: '../escape' }],
        [entries[0], { ...entries[1], slug: entries[0].slug }],
        [entries[0], { ...entries[1], label: entries[0].label.toUpperCase() }],
    ]) {
        fs.writeFileSync(manifest(), JSON.stringify(value));
        assert.throws(() => listFlows(), /reporting-entries\.json/);
    }
    fs.writeFileSync(manifest(), '{ invalid JSON');
    assert.throws(() => listFlows(), SyntaxError);
});

test('enriches selectable units with shared published labels and symbols without guessing', () => {
    const snapshot = 'poc/poc-flow-operationeel/src/generated/csor.json';
    fs.mkdirSync(path.dirname(path.join(root, snapshot)), { recursive: true });
    fs.copyFileSync(path.join(realRoot, snapshot), path.join(root, snapshot));
    const waste = getStep({ step: 'lucht' }).fields.find(field => field.id === 'lucht:afvalproduct')!;
    const quantity = waste.parts![1].parts!.find(field => field.id === 'lucht:afvalproduct_hoeveelheid')!;
    assert.equal(quantity.unit?.choose?.length, 7);
    assert.deepEqual(quantity.unit?.choose?.find(unit => unit.id === 'csor_eenheid:E_89'),
        { id: 'csor_eenheid:E_89', label: 'gigajoule', symbol: 'GJ' });
    fs.unlinkSync(path.join(root, snapshot));
    const missing = getStep({ step: 'lucht' }).fields.find(field => field.id === 'lucht:afvalproduct')!
        .parts![1].parts!.find(field => field.id === 'lucht:afvalproduct_hoeveelheid')!;
    assert.ok(missing.issues?.some(issue => /Published unit labels are unavailable/.test(issue)));
    assert.equal(missing.unit?.choose?.length, 7);
});
