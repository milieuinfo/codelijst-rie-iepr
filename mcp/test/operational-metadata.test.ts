import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, test } from 'vitest';
import { updateFlowItem } from '../src/flows-edit.js';
import { CsvFile } from '../src/csv.js';

const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let root: string;
let previous: string | undefined;
beforeEach(() => {
    previous = process.env.CODELIJST_ROOT;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-metadata-'));
    fs.cpSync(path.join(realRoot, 'src/source'), path.join(root, 'src/source'), { recursive: true });
    process.env.CODELIJST_ROOT = root;
    const csv = new CsvFile(file());
    const row = csv.rows.find(row => row.record._id === id)!;
    csv.replaceLine(row.index, {
        ...row.record, relevantObservation: 'grondwater:onttrekking-eindmeterstand',
        _table_workbook: 'previous.ods', _table_sheet: 'Vorige',
    });
    csv.save();
});
afterEach(() => {
    if (previous === undefined) delete process.env.CODELIJST_ROOT;
    else process.env.CODELIJST_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
});
const id = 'grondwater:onttrekking-einddatum';
const file = () => path.join(root, 'src/source/operationeel_grondwater.csv');

test('previews and writes multi-observation ownership and worksheet placement without changing other rows', () => {
    const before = fs.readFileSync(file(), 'utf8');
    const set = {
        relevantObservation: ['grondwater:onttrekking-eindmeterstand', 'grondwater:onttrekking-hoeveelheid'],
        tableWorkbook: 'grondwater-debieten.ods', tableSheet: 'Debieten',
    };
    const preview = updateFlowItem({ id, set, dryRun: true });
    assert.equal(fs.readFileSync(file(), 'utf8'), before);
    assert.ok(preview.changes?.some(change => change.after?.includes('grondwater:onttrekking-eindmeterstand|grondwater:onttrekking-hoeveelheid')));
    updateFlowItem({ id, set, dryRun: false });
    const after = new CsvFile(file());
    const record = after.records.find(record => record._id === id)!;
    assert.equal(record.relevantObservation, set.relevantObservation.join('|'));
    assert.equal(record._table_sheet, 'Debieten');
    assert.deepEqual(after.lines.filter(line => !line.startsWith(id + ',')), before.trimEnd().split('\n').filter(line => !line.startsWith(id + ',')));
});

test('rejects unknown/non-observation targets and unsafe table metadata', () => {
    for (const set of [
        { relevantObservation: ['grondwater:missing'] },
        { relevantObservation: ['grondwater:onttrekking-feature'] },
        { tableWorkbook: '../outside.ods', tableSheet: 'Debieten' },
        { tableWorkbook: 'template.xlsx', tableSheet: 'Debieten' },
        { tableSheet: 'bad/sheet' },
        { tableSheet: 'x'.repeat(32) },
    ]) assert.throws(() => updateFlowItem({ id, set, dryRun: true }));
});

test('can clear both table placement fields together', () => {
    updateFlowItem({ id, set: { tableWorkbook: null, tableSheet: null }, dryRun: false });
    const record = new CsvFile(file()).records.find(record => record._id === id)!;
    assert.equal(record._table_workbook, '');
    assert.equal(record._table_sheet, '');
});
