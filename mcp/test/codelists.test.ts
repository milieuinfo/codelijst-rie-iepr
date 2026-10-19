import { beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every test works on a fresh copy of src/source so the real code lists are never touched.
const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let root: string;
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-mcp-'));
    fs.cpSync(path.join(realRoot, 'src', 'source'), path.join(root, 'src', 'source'), { recursive: true });
    fs.copyFileSync(path.join(realRoot, 'README.md'), path.join(root, 'README.md'));
    process.env.CODELIJST_ROOT = root;
});

const { addProperty, listProperties } = await import('../src/eigenschappen.js');
const { addSelectionList } = await import('../src/lists.js');
const { addType } = await import('../src/systeemtypes.js');
const { validate } = await import('../src/validate.js');
const read = (file: string) => fs.readFileSync(path.join(root, 'src', 'source', file), 'utf8');

test('dry run does not write', () => {
    const before = read('installatie_type.csv');
    const result = addType({ system: 'installatie', code: 'nieuw', prefLabel: 'Nieuw', definition: 'Een nieuw type.' });
    assert.equal(read('installatie_type.csv'), before);
    assert.match(result.insertedLines![0], /^installatie:nieuw,skos:Concept,conceptscheme:installatie_type,/);
});

test('subtype is placed below its broader type without topConceptOf', () => {
    addType({ system: 'installatie', code: 'condensatie_stookinstallatie', prefLabel: 'Condensatie stookinstallatie', definition: 'Een condenserende stookinstallatie.', broader: 'stookinstallatie', dryRun: false });
    const lines = read('installatie_type.csv').split('\n');
    const at = lines.findIndex(l => l.startsWith('installatie:condensatie_stookinstallatie,'));
    assert.ok(lines[at - 1].startsWith('installatie:indirecte_stookinstallatie,'));
    assert.ok(lines[at].trimEnd().endsWith('installatie:stookinstallatie,false,true'));
});

test('rejects duplicate ids, bad codes and unknown broader', () => {
    assert.throws(() => addType({ system: 'installatie', code: 'gpbv', prefLabel: 'X', definition: 'X.' }), /already exists/);
    assert.throws(() => addType({ system: 'installatie', code: 'Nieuw-Type', prefLabel: 'X', definition: 'X.' }), /snake_case/);
    assert.throws(() => addType({ system: 'filter', code: 'x', prefLabel: 'X', definition: 'X.', broader: 'bestaat_niet' }), /not a type/);
});

test('property with a code list requires a decision on its source', async () => {
    await assert.rejects(
        addProperty({ system: 'filter', code: 'materiaal', prefLabel: 'Materiaal', definition: 'Het materiaal.', appliesTo: ['peil'], codeList: ['conceptscheme:filter_materiaal'] }),
        /Ask the user/,
    );
    const asked: string[][] = [];
    await assert.rejects(
        addProperty(
            { system: 'filter', code: 'materiaal', prefLabel: 'Materiaal', definition: 'Het materiaal.', appliesTo: ['peil'], codeList: ['conceptscheme:filter_materiaal'] },
            { askCodeListSource: async list => { asked.push(list); return 'inline'; } },
        ),
        /create it first with add_selection_list/,
    );
    assert.deepEqual(asked, [['conceptscheme:filter_materiaal']]);
});

test('inline concept scheme declares its prefix and can be used as code list', async () => {
    addSelectionList({
        system: 'filter', kind: 'conceptscheme', name: 'materiaal', prefLabel: 'Filtermateriaal', definition: 'Materialen van een filter.',
        concepts: [{ code: 'pvc', prefLabel: 'PVC', definition: 'Een filter uit PVC.' }], dryRun: false,
    });
    assert.match(read('config.yml'), /filter-selectiemogelijkheden: .*\/filter-eigenschappen-selectiemogelijkheden\//);
    assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /\| `filter-selectiemogelijkheden:` \|/);

    await addProperty({
        system: 'filter', code: 'materiaal', prefLabel: 'Materiaal', definition: 'Het materiaal.', appliesTo: ['peil', 'pomp'],
        codeList: ['conceptscheme:filter_materiaal'], codeListSource: 'inline', isMultiselect: true, dryRun: false,
    });
    const property = listProperties('filter').properties.find(p => p.id === 'filter-eigenschappen:materiaal')!;
    assert.deepEqual(property.appliesTo, ['filter:peil', 'filter:pomp']);
    assert.equal(property.isMultiselect, 'true');
    assert.equal(validate(['filter']).errors, 0);
});

test('published code list must not be defined inline', async () => {
    await assert.rejects(
        addProperty({ system: 'emissiepunt', code: 'plaats', prefLabel: 'Plaats', definition: 'De plaats.', appliesTo: ['lozingspunt'], codeList: ['conceptscheme:lozingspunt_lozingsplaats'], codeListSource: 'published' }),
        /defined inline/,
    );
});

test('collection of units and composite property with parts', async () => {
    addSelectionList({
        system: 'meetpunt', kind: 'collection', name: 'diepte_eenheden', prefLabel: 'Eenheden voor diepte', definition: 'Eenheden voor een diepte.',
        members: ['csor_eenheid:E_59'], dryRun: false,
    });
    await addProperty({ system: 'meetpunt', code: 'sonde', prefLabel: 'Sonde', definition: 'Een sonde.', composite: true, isMeervoudig: true, appliesTo: ['peilput'], dryRun: false });
    await addProperty({ system: 'meetpunt', code: 'sonde_diepte', parent: 'sonde', prefLabel: 'Diepte', definition: 'De diepte.', datatype: 'xsd:decimal', unit: ['collectie:diepte_eenheden'], dryRun: false });

    const csv = read('meetpunt_eigenschappen.csv');
    assert.match(csv.split('\n')[0], /,collections$/);
    assert.match(csv, /\ncsor_eenheid:E_59,(,)+collectie:diepte_eenheden\n/);
    const sonde = listProperties('meetpunt').properties.find(p => p.id === 'meetpunt-eigenschappen:sonde')! as { composite?: boolean; parts: Array<{ id: string }> };
    assert.equal(sonde.composite, true);
    assert.equal(sonde.parts[0].id, 'meetpunt-eigenschappen:sonde_diepte');
    assert.equal(validate(['meetpunt']).errors, 0);
});

test('leaf property needs exactly one of datatype or code list, and units only on numbers', async () => {
    const base: Parameters<typeof addProperty>[0] = { system: 'filter', code: 'x', prefLabel: 'X', definition: 'X.', appliesTo: ['peil'] };
    await assert.rejects(addProperty(base), /either a datatype/);
    await assert.rejects(addProperty({ ...base, datatype: 'xsd:string', unit: ['csor_eenheid:E_59'] }), /numeric/);
    await assert.rejects(addProperty({ ...base, datatype: 'xsd:string', appliesTo: [] }), /appliesTo/);
});
