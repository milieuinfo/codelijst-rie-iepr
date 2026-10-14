import { beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs the real `npm run generate_skos` on a full copy of the repository.
const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let root: string;
beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-mcp-pipeline-'));
    fs.cpSync(path.join(realRoot, 'src'), path.join(root, 'src'), { recursive: true });
    for (const file of ['package.json', 'pom.xml', 'README.md']) fs.copyFileSync(path.join(realRoot, file), path.join(root, file));
    fs.symlinkSync(path.join(realRoot, 'node_modules'), path.join(root, 'node_modules'));
    process.env.CODELIJST_ROOT = root;
});

const { addType } = await import('../src/systeemtypes.js');
const { validatedWrite } = await import('../src/pipeline.js');
const source = (file: string) => path.join(root, 'src', 'source', file);

test('valid change is written and validated by generate_skos', { timeout: 300_000 }, async () => {
    const result = await validatedWrite(() => addType({
        system: 'filter', code: 'test_filter', prefLabel: 'Testfilter', definition: 'Een filter om te testen.', dryRun: false,
    }), { root });
    assert.equal(result.generateSkos.ok, true);
    assert.match(fs.readFileSync(source('filter_type.csv'), 'utf8'), /^filter:test_filter,/m);
    const nt = fs.readFileSync(path.join(root, 'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.nt'), 'utf8');
    assert.match(nt, /filter-type\/test_filter>/);
});

test('change that breaks generate_skos is rolled back', { timeout: 300_000 }, async () => {
    const csvBefore = fs.readFileSync(source('filter_type.csv'), 'utf8');
    const ntPath = path.join(root, 'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.nt');
    const ntBefore = fs.readFileSync(ntPath, 'utf8');
    await assert.rejects(
        validatedWrite(() => fs.appendFileSync(source('filter_type.csv'), 'onbekend:x,skos:Concept,,conceptscheme:filter_type,,X,,X.,,,,true\n'), { root }),
        /generate_skos failed.*rolled back/s,
    );
    assert.equal(fs.readFileSync(source('filter_type.csv'), 'utf8'), csvBefore);
    assert.equal(fs.readFileSync(ntPath, 'utf8'), ntBefore);
});
