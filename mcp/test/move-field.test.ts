import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, test } from 'vitest';
import { addField, moveField, updateFlowItem } from '../src/flows-edit.js';
import { getStep } from '../src/flows.js';
import { CsvFile } from '../src/csv.js';

const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let root: string;
let previous: string | undefined;
const file = () => path.join(root, 'src/source/operationeel_lucht.csv');
const read = () => fs.readFileSync(file(), 'utf8');
const record = (id: string) => new CsvFile(file()).records.find(row => row._id === id)!;

beforeEach(() => {
    previous = process.env.CODELIJST_ROOT;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-move-'));
    fs.cpSync(path.join(realRoot, 'src/source'), path.join(root, 'src/source'), { recursive: true });
    process.env.CODELIJST_ROOT = root;
});
afterEach(() => {
    if (previous === undefined) delete process.env.CODELIJST_ROOT;
    else process.env.CODELIJST_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
});

test('previews a group move and writes every part without renaming or losing unrelated cells', () => {
    moveField({ field: 'lucht:brandstof', step: 'lucht_rapportering', dryRun: false });
    const before = read();
    const rows = new CsvFile(file()).records;
    const args = { field: 'lucht:brandstof', step: 'operationeel_lucht', parent: 'lucht:emissie' };
    const preview = moveField({ ...args, dryRun: true });
    assert.equal(read(), before);
    assert.ok(preview.changes!.some(change => change.after?.startsWith('lucht:brandstof_s,')));
    moveField({ ...args, dryRun: false });
    const moved = new Set(['lucht:brandstof', 'lucht:brandstof_installatie', 'lucht:brandstof_naam',
        'lucht:brandstof_aard', 'lucht:brandstof_s', 'lucht:brandstof_as', 'lucht:brandstof_verbruik']);
    for (const id of moved) {
        assert.equal(record(id).inScheme, 'conceptscheme:operationeel_lucht');
        assert.equal(record(id).topConceptOf, '');
    }
    assert.equal(record('lucht:brandstof').broaderPartitive, 'lucht:emissie');
    assert.equal(record('lucht:brandstof_s').broaderPartitive, 'lucht:brandstof');
    assert.equal(record('lucht:verbruikte_stof')._ui_first, '');
    assert.equal(record('lucht:verbruikte_stof')._ui_after, 'lucht:emissie');
    for (const row of rows) {
        const after = record(row._id);
        assert.ok(after, `Missing published ID ${row._id}`);
        const allowed = moved.has(row._id)
            ? new Set(['inScheme', 'topConceptOf', ...(row._id === 'lucht:brandstof' ? ['broaderPartitive', '_ui_first', '_ui_after'] : [])])
            : row._id === 'lucht:verbruikte_stof' ? new Set(['_ui_first', '_ui_after']) : new Set();
        for (const [key, value] of Object.entries(row)) if (!allowed.has(key)) assert.equal(after[key], value, `${row._id}.${key}`);
    }
    const parts = getStep({ step: args.step }).fields.find(field => field.id === 'lucht:emissie')!.parts!;
    assert.equal(parts.at(-1)!.id, 'lucht:brandstof');
});

test('can reparent in the same step and move back to the top level', () => {
    moveField({ field: 'lucht:brandstof_s', step: 'lucht', parent: 'lucht:verbruikte_stof', dryRun: false });
    assert.equal(record('lucht:brandstof_s').broaderPartitive, 'lucht:verbruikte_stof');
    assert.equal(record('lucht:brandstof_as')._ui_after, 'lucht:brandstof_aard');
    moveField({ field: 'lucht:brandstof_s', step: 'lucht_rapportering', dryRun: false });
    assert.equal(record('lucht:brandstof_s').topConceptOf, 'conceptscheme:operationeel_lucht_rapportering');
    assert.equal(record('lucht:brandstof_s').broaderPartitive, '');
});

test('rejects invalid destinations, self containment, no-ops and non-fields without writing', () => {
    const before = read();
    for (const args of [
        { field: 'lucht:brandstof', step: 'operationeel_lucht' },
        { field: 'lucht:brandstof', step: 'operationeel_grondwater' },
        { field: 'lucht:brandstof', step: 'operationeel_lucht_emissie', parent: 'lucht:brandstof_s' },
        { field: 'lucht:brandstof', step: 'operationeel_lucht_emissie', parent: 'lucht:verbruikte_stof' },
        { field: 'conceptscheme:operationeel_lucht', step: 'operationeel_lucht_emissie' },
    ]) assert.throws(() => moveField({ ...args, dryRun: false }));
    assert.equal(read(), before);
});

test('refuses incoming and outgoing conditions split by a move', () => {
    addField({ step: 'lucht_rapportering', code: 'move_trigger', prefLabel: 'Trigger',
        definition: 'Een testkeuze.', datatype: 'xsd:boolean', dryRun: false });
    addField({ step: 'lucht_rapportering', code: 'move_detail', prefLabel: 'Detail',
        definition: 'Een testdetail.', datatype: 'xsd:string',
        conditionPath: 'lucht:move_trigger', conditionValue: 'true', dryRun: false });
    const before = read();
    for (const field of ['lucht:move_trigger', 'lucht:move_detail']) {
        assert.throws(() => moveField({ field, step: 'lucht_emissie', dryRun: false }), /conditionPath/);
        assert.equal(read(), before);
    }
});

test('refuses separating observation ownership, selection dependencies and table keys', () => {
    updateFlowItem({ id: 'lucht:emissie', set: { tableKey: ['lucht:emissietype'] }, dryRun: false });
    assert.throws(() => moveField({ field: 'lucht:emissietype', step: 'lucht_rapportering' }), /tableKey/);
    assert.throws(() => moveField({ field: 'lucht:emissie_vochtgehalte', step: 'lucht_rapportering' }), /relevantObservation/);
    addField({ step: 'lucht_rapportering', code: 'move_point', prefLabel: 'Punt',
        definition: 'Een testpunt.', relevantRiepr: ['emissiepunt:emissiepunt_lucht'], dryRun: false });
    addField({ step: 'lucht_rapportering', code: 'move_source', prefLabel: 'Bron',
        definition: 'Een testbron.', relevantRiepr: ['riepr:Installatie'],
        referenceParent: 'lucht:move_point', referenceRelation: 'prov:wasDerivedFrom', dryRun: false });
    const before = read();
    for (const field of ['lucht:move_point', 'lucht:move_source']) {
        assert.throws(() => moveField({ field, step: 'lucht_emissie', dryRun: false }), /referenceParent/);
        assert.equal(read(), before);
    }
});

test('rejects self-referential navigation after a move', () => {
    addField({ step: 'lucht_rapportering', code: 'move_next', prefLabel: 'Volgende stap',
        definition: 'Een testkeuze met navigatie.', datatype: 'xsd:string',
        vervolgstap: ['conceptscheme:operationeel_lucht_bron'], dryRun: false });
    const before = read();
    assert.throws(() => moveField({ field: 'lucht:move_next', step: 'lucht_bron', dryRun: false }), /vervolgstap/);
    assert.equal(read(), before);
});

test('preserves dependencies whose selectors move together inside a group', () => {
    addField({ step: 'lucht_rapportering', code: 'move_bundle', prefLabel: 'Bundel',
        definition: 'Een testgroep.', isMeervoudig: true, dryRun: false });
    addField({ step: 'lucht_rapportering', code: 'move_point', prefLabel: 'Punt',
        definition: 'Een testpunt.', parent: 'lucht:move_bundle',
        relevantRiepr: ['emissiepunt:emissiepunt_lucht'], dryRun: false });
    addField({ step: 'lucht_rapportering', code: 'move_source', prefLabel: 'Bron',
        definition: 'Een testbron.', parent: 'lucht:move_bundle', relevantRiepr: ['riepr:Installatie'],
        referenceParent: 'lucht:move_point', referenceRelation: 'prov:wasDerivedFrom', dryRun: false });
    updateFlowItem({ id: 'lucht:move_bundle', set: { tableKey: ['lucht:move_point', 'lucht:move_source'] }, dryRun: false });
    moveField({ field: 'lucht:move_bundle', step: 'lucht_emissie', dryRun: false });
    assert.equal(record('lucht:move_bundle').topConceptOf, 'conceptscheme:operationeel_lucht_emissie');
    assert.equal(record('lucht:move_bundle')._table_key, 'lucht:move_point|lucht:move_source');
    assert.equal(record('lucht:move_source').referenceParent, 'lucht:move_point');
    for (const id of ['lucht:move_bundle', 'lucht:move_point', 'lucht:move_source']) {
        assert.equal(record(id).inScheme, 'conceptscheme:operationeel_lucht_emissie');
    }
});

test('refuses reparenting a characteristic into an independent repeated observation', () => {
    addField({ step: 'lucht', code: 'move_other', prefLabel: 'Andere meting',
        definition: 'Een onafhankelijke testmeting.', relevantClass: 'riepr:ObservatieVerzameling',
        isMeervoudig: true, dryRun: false });
    const before = read();
    assert.throws(() => moveField({
        field: 'lucht:emissieritme', step: 'lucht',
        parent: 'lucht:move_other', dryRun: false,
    }), /relevantObservation.*independent repeated records/);
    assert.equal(read(), before);
});
