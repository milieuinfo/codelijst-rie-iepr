import { beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
beforeAll(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-mcp-query-'));
    fs.cpSync(path.join(realRoot, 'src', 'source'), path.join(root, 'src', 'source'), { recursive: true });
    fs.copyFileSync(path.join(realRoot, 'README.md'), path.join(root, 'README.md'));
    process.env.CODELIJST_ROOT = root;
});

const { addProperty } = await import('../src/eigenschappen.js');
const { addType } = await import('../src/systeemtypes.js');
const { getProperty, getTypeProperties, searchCodelists } = await import('../src/query.js');

test('resolves a type by label across systems and reports inherited properties', async () => {
    await addType({ system: 'installatie', code: 'grondfakkel', prefLabel: 'Grondfakkel', definition: 'Een fakkel op grondniveau.', broader: 'fakkel', dryRun: false });
    await addProperty({ system: 'installatie', code: 'fakkel_capaciteit', prefLabel: 'Capaciteit van de fakkel', definition: 'De capaciteit.', appliesTo: ['fakkel'], datatype: 'xsd:decimal', dryRun: false });
    await addProperty({ system: 'installatie', code: 'bouwjaar', prefLabel: 'Bouwjaar', definition: 'Het bouwjaar.', appliesTo: ['all'], datatype: 'xsd:integer', dryRun: false });

    const fakkel = getTypeProperties({ type: 'Fakkel', system: 'installatie' });
    assert.equal(fakkel.type.id, 'installatie:fakkel');
    assert.deepEqual(fakkel.type.subtypes.map(s => s.id), ['installatie:grondfakkel']);
    const via = Object.fromEntries(fakkel.properties.map(p => [p.id, p.appliesVia]));
    assert.equal(via['installatie-eigenschappen:technische_kenmerken'], 'direct');
    assert.equal(via['installatie-eigenschappen:fakkel_capaciteit'], 'direct');
    assert.equal(via['installatie-eigenschappen:bouwjaar'], 'all installatie types');
    assert.equal(via['installatie-eigenschappen:geinstalleerde_productiecapaciteit'], undefined);

    const grondfakkel = getTypeProperties({ type: 'grondfakkel' });
    assert.match(String(grondfakkel.properties.find(p => p.id === 'installatie-eigenschappen:fakkel_capaciteit')?.appliesVia), /inherited from installatie:fakkel/);
});

test('composite with relevantRiepr on its parts applies to that type', () => {
    const result = getTypeProperties({ type: 'luchtzuivering', system: 'installatie' });
    const composite = result.properties.find(p => p.id === 'installatie-eigenschappen:verwijderingsrendement')!;
    assert.equal(composite.composite, true);
    assert.deepEqual(composite.parts?.map(p => p.id), [
        'installatie-eigenschappen:verwijderingsrendement_stof', 'installatie-eigenschappen:verwijderingsrendement_percentage',
    ]);
});

test('properties of subtypes are listed separately', () => {
    // filter:filter has the general properties; diepte_pomp only applies to its subtype filter:pomp.
    const result = getTypeProperties({ type: 'filter:filter' });
    assert.ok(result.properties.some(p => p.id === 'filter-eigenschappen:diepte'));
    assert.ok(!result.properties.some(p => p.id === 'filter-eigenschappen:diepte_pomp'));
    assert.deepEqual(result.subtypeProperties?.map(p => p.id), ['filter-eigenschappen:diepte_pomp']);
    assert.equal(getTypeProperties({ type: 'stookinstallatie' }).subtypeProperties, undefined);
});

test('property details include selection options and the types it applies to', () => {
    const property = getProperty({ property: 'lozingsplaats' });
    const options = property.codeList[0];
    assert.ok('members' in options);
    assert.deepEqual(options.members.map(m => m.prefLabel), ['Oppervlaktewater', 'Riool', 'Grondwater', 'Collector', 'Externe waterzuivering', 'Regenwaterriolering']);
    const vermogen = getProperty({ property: 'nominaal thermisch vermogen' });
    assert.deepEqual(vermogen.appliesTo.map(t => t.id), ['installatie:stookinstallatie', 'installatie:directe_stookinstallatie', 'installatie:indirecte_stookinstallatie']);
});

test('ambiguous or unknown names ask for clarification', () => {
    assert.throws(() => getProperty({ property: 'diepte' }), /several properties/);
    assert.throws(() => getTypeProperties({ type: 'raket' }), /No type matches/);
});

test('search is case- and accent-insensitive', () => {
    const results = searchCodelists({ query: 'GEINSTALLEERD' }).results.map(r => r.id);
    assert.ok(results.includes('installatie-eigenschappen:geinstalleerde_productiecapaciteit'));
});
