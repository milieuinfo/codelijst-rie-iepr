import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, test } from 'vitest';
import { applyOperationalBatch, type OperationalEdit } from '../src/flows-batch.js';
import { getStep } from '../src/flows.js';
import { repoRoot, withRepoRoot } from '../src/repo.js';
import { validatedWrite, type CsvFixResult, type Generation } from '../src/pipeline.js';

const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let root: string;
let previous: string | undefined;
const source = () => path.join(root, 'src/source/operationeel_lucht.csv');
const operations: OperationalEdit[] = [
    { tool: 'add_flow_collection', args: {
        name: 'operationeel_batch_eenheden', prefLabel: 'Testeenheden',
        definition: 'Eenheden voor een tijdelijke test.', members: ['csor_eenheid:E_41', 'csor_eenheid:E_32'],
    } },
    { tool: 'add_field', args: {
        step: 'lucht', code: 'batch_hoeveelheid', prefLabel: 'Testhoeveelheid',
        definition: 'Een hoeveelheid voor een tijdelijke test.', parent: 'lucht:afvalproduct_resultaat',
        datatype: 'xsd:decimal', unit: ['collectie:operationeel_batch_eenheden'], relation: 'qudt:numericValue',
    } },
    { tool: 'update_flow_item', args: { id: 'lucht:batch_hoeveelheid', set: { minValue: 0, maxValue: 100 } } },
];
const okGeneration: Generation = { ok: true, exitCode: 0, durationMs: 1, output: '', summary: 'Validated' };
const okFix: CsvFixResult = { ...okGeneration, fixedLines: [] };

beforeEach(() => {
    previous = process.env.CODELIJST_ROOT;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-flow-batch-'));
    fs.cpSync(path.join(realRoot, 'src/source'), path.join(root, 'src/source'), { recursive: true });
    process.env.CODELIJST_ROOT = root;
});

afterEach(() => {
    if (previous === undefined) delete process.env.CODELIJST_ROOT;
    else process.env.CODELIJST_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
});

test('previews dependent additions and reports final lines, never intermediate values', () => {
    const before = fs.readFileSync(source(), 'utf8');
    const misc = fs.readFileSync(path.join(root, 'src/source/operationeel_misc.csv'), 'utf8');
    const preview = applyOperationalBatch({ operations });
    assert.match(preview.status, /dry-run/);
    assert.equal(preview.operations.length, 3);
    assert.equal(preview.files.length, 2);
    const resulting = preview.files.find(file => file.file.endsWith('operationeel_lucht.csv'))!.resultingLines;
    assert.equal(resulting.filter(line => line.text.startsWith('lucht:batch_hoeveelheid,')).length, 1);
    assert.match(resulting.find(line => line.text.startsWith('lucht:batch_hoeveelheid,'))!.text, /,0,100,/);
    assert.equal(fs.readFileSync(source(), 'utf8'), before);
    assert.equal(fs.readFileSync(path.join(root, 'src/source/operationeel_misc.csv'), 'utf8'), misc);
    assert.equal(repoRoot(), root);
});

test('invalid later operations leave all originals unchanged and restore scoped root', () => {
    const before = fs.readFileSync(source(), 'utf8');
    const misc = fs.readFileSync(path.join(root, 'src/source/operationeel_misc.csv'), 'utf8');
    assert.throws(() => applyOperationalBatch({
        operations: [...operations, { tool: 'update_flow_item', args: { id: 'lucht:missing', set: { prefLabel: 'Missing' } } }],
        dryRun: false,
    }), /missing/);
    assert.equal(fs.readFileSync(source(), 'utf8'), before);
    assert.equal(fs.readFileSync(path.join(root, 'src/source/operationeel_misc.csv'), 'utf8'), misc);
    assert.equal(repoRoot(), root);
    assert.throws(() => applyOperationalBatch({ operations: [] }), /at least one/);
});

test('one approved batch runs one CSV fix and one SKOS validation', async () => {
    let fixes = 0;
    let generations = 0;
    const result = await validatedWrite(() => applyOperationalBatch({ operations, dryRun: false }), {
        root,
        csvFix: async () => { fixes++; return okFix; },
        generate: async () => { generations++; return okGeneration; },
    });
    assert.equal(fixes, 1);
    assert.equal(generations, 1);
    assert.equal(result.generateSkos.ok, true);
    const waste = getStep({ step: 'lucht' }).fields.find(field => field.id === 'lucht:afvalproduct')!;
    const value = waste.parts![1].parts!.find(field => field.id === 'lucht:batch_hoeveelheid')!;
    assert.deepEqual(value.range, { min: 0, max: 100 });
    assert.equal(value.unit?.choose?.length, 2);
});

test.each(['failed', 'throws', 'csv-throws'])('rolls back the full batch and generated files when validation %s', async mode => {
    fs.appendFileSync(source(), '\n');
    const before = fs.readFileSync(source(), 'utf8');
    const misc = fs.readFileSync(path.join(root, 'src/source/operationeel_misc.csv'), 'utf8');
    const generated = path.join(root, 'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.ttl');
    fs.mkdirSync(path.dirname(generated), { recursive: true });
    fs.writeFileSync(generated, 'existing dirty generated output');
    await assert.rejects(validatedWrite(() => applyOperationalBatch({ operations, dryRun: false }), {
        root,
        csvFix: async () => {
            if (mode === 'csv-throws') throw new Error('CSV validation interrupted');
            return okFix;
        },
        generate: async () => {
            fs.writeFileSync(generated, 'new generated output');
            if (mode === 'throws') throw new Error('Generation interrupted');
            return { ...okGeneration, ok: false, exitCode: 1 };
        },
    }));
    assert.equal(fs.readFileSync(source(), 'utf8'), before);
    assert.equal(fs.readFileSync(path.join(root, 'src/source/operationeel_misc.csv'), 'utf8'), misc);
    assert.equal(fs.readFileSync(generated, 'utf8'), 'existing dirty generated output');
});

test('scoped roots do not leak across concurrent asynchronous contexts', async () => {
    const contexts = await Promise.all(['one', 'two'].map(name =>
        withRepoRoot(path.join(root, name), async () => {
            await new Promise(resolve => setTimeout(resolve, 1));
            return repoRoot();
        })));
    assert.deepEqual(contexts, [path.join(root, 'one'), path.join(root, 'two')]);
    assert.equal(repoRoot(), root);
});

test('serializes validation boundaries so one rollback cannot overwrite another batch', async () => {
    const order: string[] = [];
    const first = validatedWrite(() => {
        order.push('first-write');
        return applyOperationalBatch({ operations, dryRun: false });
    }, {
        root, csvFix: async () => okFix, generate: async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            order.push('first-failure');
            return { ...okGeneration, ok: false, exitCode: 1 };
        },
    });
    const second = validatedWrite(() => {
        order.push('second-write');
        return applyOperationalBatch({ operations, dryRun: false });
    }, { root, csvFix: async () => okFix, generate: async () => okGeneration });
    const results = await Promise.allSettled([first, second]);
    assert.deepEqual(order, ['first-write', 'first-failure', 'second-write']);
    assert.equal(results[0].status, 'rejected');
    assert.equal(results[1].status, 'fulfilled');
    assert.match(fs.readFileSync(source(), 'utf8'), /^lucht:batch_hoeveelheid,/m);
});

test('validates an approved batch with the real CSV fixer and SKOS generator', { timeout: 300_000 }, async () => {
    fs.cpSync(path.join(realRoot, 'src'), path.join(root, 'src'), { recursive: true });
    for (const file of ['package.json', 'pom.xml', 'README.md']) {
        fs.copyFileSync(path.join(realRoot, file), path.join(root, file));
    }
    fs.symlinkSync(path.join(realRoot, 'node_modules'), path.join(root, 'node_modules'));
    const result = await validatedWrite(() => applyOperationalBatch({ operations, dryRun: false }), { root });
    assert.equal(result.csvFix.ok, true);
    assert.equal(result.generateSkos.ok, true);
    assert.match(fs.readFileSync(source(), 'utf8'), /^lucht:batch_hoeveelheid,/m);
});
