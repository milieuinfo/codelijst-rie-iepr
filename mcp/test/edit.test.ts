import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, test } from 'vitest';

// Every test works on a fresh copy of src/source so the real code lists are never touched.
const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let root: string;
// Errors already in the real data (open modelling decisions) are not caused by the edit under test.
let baseline = new Set<string>();
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-mcp-edit-'));
    fs.cpSync(path.join(realRoot, 'src', 'source'), path.join(root, 'src', 'source'), { recursive: true });
    fs.copyFileSync(path.join(realRoot, 'README.md'), path.join(root, 'README.md'));
    process.env.CODELIJST_ROOT = root;
    baseline = errorsOf(validate(SYSTEMS));
});

const { addProperty, deleteProperty, updateProperty } = await import('../src/eigenschappen.js');
const { addSelectionList, deleteSelectionList, removeListEntries, updateSelectionList } = await import('../src/lists.js');
const { addType, deleteType, updateType } = await import('../src/systeemtypes.js');
const { validate } = await import('../src/validate.js');
const { ValidationError } = await import('../src/rules.js');
const { SYSTEMS } = await import('../src/repo.js');
const errorsOf = (result: ReturnType<typeof validate>) => new Set(result.issues.filter(i => i.level === 'error').map(i => i.message));
const newErrors = (systems: Parameters<typeof validate>[0]) => [...errorsOf(validate(systems))].filter(e => !baseline.has(e));
const read = (file: string) => fs.readFileSync(path.join(root, 'src', 'source', file), 'utf8');
const line = (file: string, id: string) => read(file).split('\n').find(l => l.startsWith(`${id},`));

test('update_type changes only the given fields and keeps its place', () => {
    const before = read('installatie_type.csv').split('\n');
    updateType({ system: 'installatie', type: 'luchtzuivering', set: { definition: 'Een installatie die lucht zuivert.' }, dryRun: false });
    const after = read('installatie_type.csv').split('\n');
    const index = before.findIndex(l => l.startsWith('installatie:luchtzuivering,'));
    assert.equal(after[index].trimEnd(), 'installatie:luchtzuivering,skos:Concept,conceptscheme:installatie_type,conceptscheme:installatie_type,,Luchtzuiveringsinstallatie,,Een installatie die lucht zuivert.,,,false,true');
    assert.deepEqual(after.filter((_, i) => i !== index), before.filter((_, i) => i !== index));
});

test('update_type moves a type between top level and subtype, and rejects cycles', () => {
    updateType({ system: 'installatie', type: 'directe_stookinstallatie', set: { broader: null }, dryRun: false });
    assert.match(line('installatie_type.csv', 'installatie:directe_stookinstallatie')!, /,skos:Concept,conceptscheme:installatie_type,conceptscheme:installatie_type,/);
    updateType({ system: 'installatie', type: 'fakkel', set: { broader: 'productie_installatie' }, dryRun: false });
    assert.throws(() => updateType({ system: 'installatie', type: 'productie_installatie', set: { broader: 'fakkel' } }), /subtype of itself/);
});

test('pre-existing problems do not block an edit', async () => {
    // filter-eigenschappen:watervoerendeLaag has a code that is not snake_case; changing its label is still allowed.
    const result = await updateProperty({ system: 'filter', property: 'watervoerendeLaag', set: { prefLabel: 'Watervoerende laag (aquifer)' } });
    assert.ok(result.warnings.some(w => /pre-existing.*snake_case/.test(w)));
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
    assert.deepEqual(newErrors(['meetpunt']), []);
});

test('update_property switches a value to a selection and keeps an empty relation empty', async () => {
    // A legacy row without datatype and with an empty relation (none are left in the real lists).
    const file = path.join(root, 'src', 'source', 'installatie_eigenschappen.csv');
    const rows = read('installatie_eigenschappen.csv').split('\n');
    const after = rows.findIndex(l => l.startsWith('installatie-eigenschappen:omschrijving,'));
    rows.splice(after + 1, 0, 'installatie-eigenschappen:testwaarde,skos:Concept,conceptscheme:installatie_eigenschappen,conceptscheme:installatie_eigenschappen,,,Testwaarde,,Een testwaarde.,,,,,,installatie:opslag_overslag,,,false,false');
    fs.writeFileSync(file, rows.join('\n'));
    await assert.rejects(
        updateProperty({ system: 'installatie', property: 'testwaarde', set: { codeList: ['conceptscheme:status_type'] } }),
        /Ask the user/,
    );
    await updateProperty({
        system: 'installatie', property: 'testwaarde',
        set: { codeList: ['conceptscheme:status_type'], codeListSource: 'published' }, dryRun: false,
    });
    assert.match(line('installatie_eigenschappen.csv', 'installatie-eigenschappen:testwaarde')!, /,rdfs:value,,conceptscheme:status_type,installatie:opslag_overslag,/);

    await updateProperty({ system: 'installatie', property: 'nominaal_thermisch_vermogen', set: { prefLabel: 'Nominaal thermisch vermogen (MW)' }, dryRun: false });
    assert.match(line('installatie_eigenschappen.csv', 'installatie-eigenschappen:nominaal_thermisch_vermogen')!, /,Nominaal thermisch vermogen \(MW\),.*,rdfs:value,xsd:decimal,/);

    await assert.rejects(
        updateProperty({ system: 'emissiepunt', property: 'hoogte', set: { datatype: 'xsd:string' } }),
        /unit only applies to numeric/,
    );
    await updateProperty({ system: 'emissiepunt', property: 'hoogte', set: { datatype: 'xsd:string', unit: null }, dryRun: false });
    assert.deepEqual(newErrors(['emissiepunt', 'installatie']), []);
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
    assert.deepEqual(newErrors(['installatie']), []);
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
    assert.throws(() => removeListEntries({
        system: 'emissiepunt', list: 'lozingspunt_lozingsplaats',
        entries: ['riool', 'oppervlaktewater', 'collector', 'externe_waterzuivering', 'regenwaterriool'],
    }), /empty/);

    deleteProperty({ system: 'emissiepunt', property: 'lozingspunt-lozingsplaats', dryRun: false });
    deleteSelectionList({ system: 'emissiepunt', list: 'lozingspunt_lozingsplaats', dryRun: false });
    const csv = read('emissiepunt_eigenschappen.csv');
    assert.doesNotMatch(csv, /lozingsplaats|selectiemogelijkheden:(riool|oppervlaktewater|collector)/);
    assert.doesNotMatch(csv.trimEnd().split('\n').at(-1)!, /^,+$/);
    assert.deepEqual(newErrors(['emissiepunt']), []);
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
    assert.deepEqual(newErrors(['installatie']), []);
});

test('identifiers cannot be renamed', async () => {
    assert.throws(() => updateType({ system: 'filter', type: 'peil', set: { code: 'x' } as never }), ValidationError);
    await assert.rejects(updateProperty({ system: 'filter', property: 'diepte', set: { code: 'x' } as never }), /published URI/);
    await assert.rejects(updateProperty({ system: 'filter', property: 'nope', set: {} }), /not an eigenschap/);
});

test('a composite may carry relevantRiepr on its parts instead of on itself', async () => {
    // meetpunt-eigenschappen:referentiepunt has no relevantRiepr; its parts _naam and _diepte apply to meetpunt:peilput.
    const result = await updateProperty({ system: 'meetpunt', property: 'referentiepunt', set: { isVerplicht: false } });
    assert.ok(!result.warnings.some(w => /appliesTo/.test(w)), result.warnings.join('\n'));

    // A new composite without appliesTo is allowed, but its parts must then say which types they apply to.
    const parent = await addProperty({ system: 'meetpunt', code: 'kalibratie', prefLabel: 'Kalibratie', definition: 'Samengestelde eigenschap voor kalibratie (datum en waarde).', composite: true, dryRun: false });
    assert.ok(parent.warnings.some(w => /applies to no type yet/.test(w)));
    const part = await addProperty({ system: 'meetpunt', code: 'kalibratie_datum', prefLabel: 'Datum', definition: 'De datum van de kalibratie.', parent: 'kalibratie', datatype: 'xsd:date' });
    assert.ok(part.warnings.some(w => /applies to no type/.test(w)));
    const typed = await addProperty({ system: 'meetpunt', code: 'kalibratie_datum', prefLabel: 'Datum', definition: 'De datum van de kalibratie.', parent: 'kalibratie', datatype: 'xsd:date', appliesTo: ['debietmeter'] });
    assert.ok(!typed.warnings.some(w => /applies to no type/.test(w)));

    // A top-level leaf property still needs appliesTo.
    await assert.rejects(() => addProperty({ system: 'meetpunt', code: 'kleur', prefLabel: 'Kleur', definition: 'De kleur.', datatype: 'xsd:string' }), /appliesTo/);
});
