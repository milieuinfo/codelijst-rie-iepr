import { beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Works on a copy of src/source and of the generated Turtle (for withdrawn types).
const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ttl = 'src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.ttl';
beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-mcp-typering-'));
    fs.cpSync(path.join(realRoot, 'src', 'source'), path.join(root, 'src', 'source'), { recursive: true });
    fs.copyFileSync(path.join(realRoot, 'README.md'), path.join(root, 'README.md'));
    fs.mkdirSync(path.dirname(path.join(root, ttl)), { recursive: true });
    fs.writeFileSync(path.join(root, ttl), [
        '@prefix emissiepunt: <https://data.omgeving.vlaanderen.be/id/concept/riepr/emissiepunt-type/>.',
        'emissiepunt:emissiepunt dcterms:modified "2026-10-16T12:00:00Z"^^xsd:dateTime;',
        '    adms:status <https://purl.archive.org/adms/status/Withdrawn>.',
    ].join('\n'));
    process.env.CODELIJST_ROOT = root;
});

const { addProperty } = await import('../src/eigenschappen.js');
const { addSelectionList } = await import('../src/lists.js');
const { validate } = await import('../src/validate.js');

const option = (code: string, prefLabel: string) => ({ code, prefLabel, definition: `${prefLabel}.` });

test('a selection list named after the system or one of its types is blocked', () => {
    assert.throws(
        () => addSelectionList({ system: 'emissiepunt', kind: 'conceptscheme', name: 'type_emissiepunt', prefLabel: 'Type emissiepunt', definition: 'De types.', concepts: [option('wasser', 'Wasser')] }),
        /looks like a typering: it selects a kind of emissiepunt.*add_type/s,
    );
    assert.throws(
        () => addSelectionList({ system: 'installatie', kind: 'conceptscheme', name: 'soort_stookinstallatie', prefLabel: 'Soort stookinstallatie', definition: 'Soorten.', concepts: [option('boiler2', 'Boiler')] }),
        /kind of installatie:stookinstallatie.*broader=installatie:stookinstallatie/s,
    );
});

test('options that are (or were) types are blocked', () => {
    assert.throws(
        () => addSelectionList({ system: 'emissiepunt', kind: 'conceptscheme', name: 'vorm', prefLabel: 'Vorm', definition: 'Vormen.', concepts: [option('gebouw2', 'Gebouw')] }),
        /'Gebouw' is the type emissiepunt:gebouw/,
    );
    assert.throws(
        () => addSelectionList({ system: 'emissiepunt', kind: 'conceptscheme', name: 'vorm', prefLabel: 'Vorm', definition: 'Vormen.', concepts: [option('emissiepunt', 'Regulier')] }),
        /emissiepunt:emissiepunt \(published, now withdrawn\)/,
    );
});

test('a typering eigenschap with a code list is blocked, free text only warns', async () => {
    await assert.rejects(
        addProperty({ system: 'installatie', code: 'type_waterzuivering', prefLabel: 'Type waterzuivering', definition: 'Het type.', appliesTo: ['waterzuivering'], codeList: ['https://example.org/conceptscheme/x'], codeListSource: 'published' }),
        /looks like a typering/,
    );
    const result = await addProperty({ system: 'installatie', code: 'type_luchtzuivering', prefLabel: 'Type luchtzuivering', definition: 'Het type.', appliesTo: ['luchtzuivering'], datatype: 'xsd:string' });
    assert.match(result.warnings!.join('\n'), /kind of installatie:luchtzuivering/);
});

test('ordinary selections are not mistaken for a typering', async () => {
    addSelectionList({ system: 'installatie', kind: 'conceptscheme', name: 'brandstof', prefLabel: 'Type brandstof', definition: 'Brandstoffen.', concepts: [option('aardgas', 'Aardgas')], dryRun: false });
    const result = await addProperty({
        system: 'installatie', code: 'type_brandstof', prefLabel: 'Type brandstof', definition: 'De brandstof.', appliesTo: ['stookinstallatie'],
        codeList: ['conceptscheme:installatie_brandstof'], codeListSource: 'inline',
    });
    assert.ok(!result.warnings?.some(w => /typering/.test(w)));
});

test('validate reports existing typering eigenschappen', () => {
    const issues = validate(['installatie']).issues.filter(i => /typering/.test(i.message));
    assert.ok(issues.some(i => i.level === 'error' && /type_stookinstallatie/.test(i.message)));
    assert.ok(issues.some(i => i.level === 'warning' && /type_opslag_overslag/.test(i.message)));
});
