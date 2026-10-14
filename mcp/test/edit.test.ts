import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, test } from 'vitest';

// Every test works on a fresh copy of src/source so the real code lists are never touched.
const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let root: string;
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-mcp-edit-'));
    fs.cpSync(path.join(realRoot, 'src', 'source'), path.join(root, 'src', 'source'), { recursive: true });
    fs.copyFileSync(path.join(realRoot, 'README.md'), path.join(root, 'README.md'));
    process.env.CODELIJST_ROOT = root;
});

const { addProperty, deleteProperty, updateProperty } = await import('../src/eigenschappen.js');
const { addSelectionList, deleteSelectionList, removeListEntries, updateSelectionList } = await import('../src/lists.js');
const { addType, deleteType, updateType } = await import('../src/systeemtypes.js');
const { validate } = await import('../src/validate.js');
const { ValidationError } = await import('../src/rules.js');
const read = (file: string) => fs.readFileSync(path.join(root, 'src', 'source', file), 'utf8');
const line = (file: string, id: string) => read(file).split('\n').find(l => l.startsWith(`${id},`));

test('update_type changes only the given fields and keeps its place', () => {
    const before = read('installatie_type.csv').split('\n');
    updateType({ system: 'installatie', type: 'luchtzuivering', set: { definition: 'Een installatie die lucht zuivert.' }, dryRun: false });
    const after = read('installatie_type.csv').split('\n');
    const index = before.findIndex(l => l.startsWith('installatie:luchtzuivering,'));
    assert.equal(after[index], 'installatie:luchtzuivering,skos:Concept,conceptscheme:installatie_type,conceptscheme:installatie_type,,Luchtzuiveringsinstallatie,,Een installatie die lucht zuivert.,,,,true');
    assert.deepEqual(after.filter((_, i) => i !== index), before.filter((_, i) => i !== index));
});

test('update_type moves a type between top level and subtype, and rejects cycles', () => {
    updateType({ system: 'installatie', type: 'directe_stookinstallatie', set: { broader: null }, dryRun: false });
    assert.match(line('installatie_type.csv', 'installatie:directe_stookinstallatie')!, /,skos:Concept,conceptscheme:installatie_type,conceptscheme:installatie_type,/);
    updateType({ system: 'emissiepunt', type: 'fakkel', set: { broader: 'schoorsteen' }, dryRun: false });
    assert.throws(() => updateType({ system: 'emissiepunt', type: 'schoorsteen', set: { broader: 'fakkel' } }), /subtype of itself/);
});

test('pre-existing problems do not block an edit', () => {
    // installatie:stookinstallatie has no definition; renaming its label is still allowed.
    const result = updateType({ system: 'installatie', type: 'stookinstallatie', set: { prefLabel: 'Stookinstallatie (algemeen)' } });
    assert.ok(result.warnings.some(w => /pre-existing.*definition/.test(w)));
    assert.throws(() => updateType({ system: 'installatie', type: 'gpbv', set: { prefLabel: 'kleine letter' } }), /capital/);
});

test('delete_type refuses while referenced and can remove itself from eigenschappen', async () => {
    assert.throws(() => deleteType({ system: 'installatie', type: 'stookinstallatie' }), /has subtypes/);
    assert.throws(() => deleteType({ system: 'filter', type: 'peil' }), /operationeel_grondwater\.csv/);

    await addType({ system: 'meetpunt', code: 'sonde', prefLabel: 'Sonde', definition: 'Een sonde.', dryRun: false });
    await addProperty({ system: 'meetpunt', code: 'kalibratie', prefLabel: 'Kalibratie', definition: 'De kalibratiedatum.', appliesTo: ['peilput', 'sonde'], datatype: 'xsd:date', dryRun: false });
    await addProperty({ system: 'meetpunt', code: 'sondetype', prefLabel: 'Sondetype', definition: 'Het type sonde.', appliesTo: ['sonde'], datatype: 'xsd:string', dryRun: false });

    assert.throws(() => deleteType({ system: 'meetpunt', type: 'sonde' }), /removeFromProperties/);
    assert.throws(() => deleteType({ system: 'meetpunt', type: 'sonde', removeFromProperties: true }), /sondetype applies only to meetpunt:sonde/);
    deleteProperty({ system: 'meetpunt', property: 'sondetype', dryRun: false });
    deleteType({ system: 'meetpunt', type: 'sonde', removeFromProperties: true, dryRun: false });

    assert.equal(line('meetpunt_type.csv', 'meetpunt:sonde'), undefined);
    assert.match(line('meetpunt_eigenschappen.csv', 'meetpunt-eigenschappen:kalibratie')!, /,meetpunt:peilput,/);
    assert.equal(validate(['meetpunt']).errors, 0);
});

test('update_property switches a value to a selection and keeps an empty relation empty', async () => {
    // geinstalleerde_opslagcapaciteit has no datatype yet and an empty relation.
    await assert.rejects(
        updateProperty({ system: 'installatie', property: 'geinstalleerde_opslagcapaciteit', set: { codeList: ['conceptscheme:status_type'] } }),
        /Ask the user/,
    );
    await updateProperty({
        system: 'installatie', property: 'geinstalleerde_opslagcapaciteit',
        set: { codeList: ['conceptscheme:status_type'], codeListSource: 'published' }, dryRun: false,
    });
    assert.match(line('installatie_eigenschappen.csv', 'installatie-eigenschappen:geinstalleerde_opslagcapaciteit')!, /,rdfs:value,,conceptscheme:status_type,installatie:opslag_overslag,/);

    await updateProperty({ system: 'installatie', property: 'geinstalleerd_vermogen', set: { prefLabel: 'Geïnstalleerd vermogen' }, dryRun: false });
    assert.match(line('installatie_eigenschappen.csv', 'installatie-eigenschappen:geinstalleerd_vermogen')!, /,Geïnstalleerd vermogen,.*,,xsd:decimal,/);

    await assert.rejects(
        updateProperty({ system: 'emissiepunt', property: 'schouw-hoogte', set: { datatype: 'xsd:string' } }),
        /unit only applies to numeric/,
    );
    await updateProperty({ system: 'emissiepunt', property: 'schouw-hoogte', set: { datatype: 'xsd:string', unit: null }, dryRun: false });
    assert.equal(validate(['emissiepunt', 'installatie']).errors, 0);
});

test('delete_property removes a composite with its parts and optionally its unused lists', () => {
    const result = deleteProperty({ system: 'installatie', property: 'verwijderingsrendement' });
    assert.match(String(result.action), /with 2 part/);
    assert.ok(result.warnings.some(w => /collectie:verwijderingsrendement_stoffen/.test(w)));

    deleteProperty({ system: 'installatie', property: 'verwijderingsrendement', deleteUnusedLists: true, dryRun: false });
    const csv = read('installatie_eigenschappen.csv');
    assert.doesNotMatch(csv, /verwijderingsrendement/);
    assert.doesNotMatch(csv, /csor_variabele:V_2217/);
    assert.match(csv, /collectie:vermogen_eenheden/);
    assert.doesNotMatch(csv, /\n,+\n,+\n/);
    assert.equal(validate(['installatie']).errors, 0);
});

test('inline lists: refuse to delete while used, edit options, remove entries, delete', async () => {
    assert.throws(() => deleteSelectionList({ system: 'emissiepunt', list: 'conceptscheme:lozingspunt_lozingsplaats' }), /still used/);

    updateSelectionList({
        system: 'emissiepunt', list: 'lozingspunt_lozingsplaats',
        set: { prefLabel: 'Lozingsplaatsen' },
        options: [{ option: 'riool', definition: 'Lozing in de openbare riolering.' }],
        dryRun: false,
    });
    assert.match(line('emissiepunt_eigenschappen.csv', 'conceptscheme:lozingspunt_lozingsplaats')!, /,Lozingsplaatsen,/);
    assert.match(line('emissiepunt_eigenschappen.csv', 'emissiepunt-selectiemogelijkheden:riool')!, /,Riool,,Lozing in de openbare riolering\.,/);

    removeListEntries({ system: 'emissiepunt', list: 'lozingspunt_lozingsplaats', entries: ['grondwater'], dryRun: false });
    assert.equal(line('emissiepunt_eigenschappen.csv', 'emissiepunt-selectiemogelijkheden:grondwater'), undefined);
    assert.throws(() => removeListEntries({ system: 'emissiepunt', list: 'lozingspunt_lozingsplaats', entries: ['riool', 'oppervlaktewater'] }), /empty/);

    deleteProperty({ system: 'emissiepunt', property: 'lozingspunt-lozingsplaats', dryRun: false });
    deleteSelectionList({ system: 'emissiepunt', list: 'lozingspunt_lozingsplaats', dryRun: false });
    const csv = read('emissiepunt_eigenschappen.csv');
    assert.doesNotMatch(csv, /lozingsplaats|selectiemogelijkheden/);
    assert.doesNotMatch(csv.trimEnd().split('\n').at(-1)!, /^,+$/);
    assert.equal(validate(['emissiepunt']).errors, 0);
});

test('removing a collection member that also belongs to another collection keeps the other membership', () => {
    addSelectionList({
        system: 'installatie', kind: 'collection', name: 'extra_eenheden', prefLabel: 'Extra eenheden', definition: 'Extra eenheden.',
        members: ['csor_eenheid:E_92', 'csor_eenheid:E_43'], dryRun: false,
    });
    removeListEntries({ system: 'installatie', list: 'collectie:extra_eenheden', entries: ['csor_eenheid:E_92'], dryRun: false });
    const memberships = () => read('installatie_eigenschappen.csv').split('\n').filter(l => l.startsWith('csor_eenheid:E_92,'));
    assert.deepEqual(memberships().map(l => l.split(',').at(5)), ['collectie:vermogen_eenheden']);

    deleteSelectionList({ system: 'installatie', list: 'extra_eenheden', dryRun: false });
    assert.doesNotMatch(read('installatie_eigenschappen.csv'), /extra_eenheden|\ncsor_eenheid:E_43,/);
    assert.equal(memberships().length, 1);
    assert.equal(validate(['installatie']).errors, 0);
});

test('identifiers cannot be renamed', async () => {
    assert.throws(() => updateType({ system: 'filter', type: 'peil', set: { code: 'x' } as never }), ValidationError);
    await assert.rejects(updateProperty({ system: 'filter', property: 'diepte', set: { code: 'x' } as never }), /published URI/);
    await assert.rejects(updateProperty({ system: 'filter', property: 'nope', set: {} }), /not an eigenschap/);
});
