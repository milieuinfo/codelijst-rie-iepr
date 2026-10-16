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
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codelijst-mcp-flows-'));
    fs.cpSync(path.join(realRoot, 'src', 'source'), path.join(root, 'src', 'source'), { recursive: true });
    fs.copyFileSync(path.join(realRoot, 'README.md'), path.join(root, 'README.md'));
    process.env.CODELIJST_ROOT = root;
});

const { getFlow, getStep, listFlows, validateFlows, getOperationalConcept } = await import('../src/flows.js');
const { addField, addFlow, addFlowCollection, addStep, deleteField, deleteStep, reorderFields, updateFlowItem } = await import('../src/flows-edit.js');
// Number of validate_flows errors in the current sources; a new flow must not add any.
process.env.CODELIJST_ROOT = realRoot;
const validateFlowsBaseline = validateFlows().errors;
const read = (file: string) => fs.readFileSync(path.join(root, 'src', 'source', file), 'utf8');
const line = (file: string, id: string) => read(file).split('\n').find(l => l.startsWith(`${id},`));

test('list_flows follows seeAlso from the thema through the steps', () => {
    const lucht = listFlows().flows.find(f => f.id === 'thema:lucht')!;
    assert.deepEqual(lucht.steps.map(s => s.id), [
        'conceptscheme:operationeel_lucht', 'conceptscheme:operationeel_lucht_bron', 'conceptscheme:operationeel_lucht_rapportering',
    ]);
});

test('get_step describes the form in display order, with conditions and options', () => {
    const step = getStep({ step: 'operationeel_grondstoffen' });
    assert.deepEqual(step.fields.map(f => f.id), ['grondstoffen:geproduceerd', 'grondstoffen:grondstof']);
    const grondstof = step.fields[1];
    assert.equal(grondstof.control, 'group');
    assert.equal(grondstof.repeatable, true);
    assert.deepEqual(grondstof.visibleWhen, { field: 'grondstoffen:geproduceerd', fieldLabel: 'Heeft u grondstoffen geproduceerd?', equals: 'true', equalsLabel: undefined });
    const parts = grondstof.parts!.map(p => p.id);
    assert.deepEqual(parts.slice(0, 3), ['grondstoffen:grondstof_materiaalcode', 'grondstoffen:grondstof_omschrijving', 'grondstoffen:grondstof_hoeveelheid']);
    const variant = grondstof.parts!.find(p => p.id === 'grondstoffen:bestemmingsidentificatie-be')!;
    assert.equal(variant.variantOf?.length, 3);
    assert.equal(variant.visibleWhen?.equals, 'bestemming:belgisch');

    const peilmeting = getStep({ step: 'operationeel_grondwater' }).fields.find(f => f.id === 'grondwater:peilmeting')!;
    const peilmethode = peilmeting.parts!.find(p => p.id === 'grondwater:peilmethode')!;
    assert.equal(peilmethode.control, 'select');
    assert.deepEqual(peilmethode.options?.items?.map(i => i.label), ['Peillint', 'Automatische sonde', 'Andere methode']);
    assert.equal(peilmeting.parts!.find(p => p.id === 'grondwater:peilmeting_feature')!.control, 'feature-picker');
});

test('get_flow gives a readable outline', () => {
    const { outline } = getFlow({ flow: 'Lucht' });
    assert.match(outline, /Stap 1: .*operationeel_lucht\)/);
    assert.match(outline, /- Emissiepunt \(feature-picker, kies uit Emissiepunt lucht\) → stap 2/);
    assert.match(outline, /Verbruik \(number, verplicht, eenheid csor_eenheid:E_89\)/);
});

test('add_flow creates the thema, file, config entry and prefix; fields get that prefix', () => {
    addFlow({ code: 'afval', prefLabel: 'Afval', definition: 'Rapportering over afval.', dryRun: false });
    assert.match(line('thema_type.csv', 'thema:afval')!, /,Afval,THEMA_AFVAL,Rapportering over afval\.,conceptscheme:operationeel_afval,/);
    assert.match(read('operationeel_afval.csv'), /^_id,_type,.*\nconceptscheme:operationeel_afval,skos:ConceptScheme,/);
    assert.match(read('config.yml'), /- operationeel_afval\.csv/);
    assert.match(read('config.yml'), /\n {2}afval: https:\/\/data\.omgeving\.vlaanderen\.be\/id\/concept\/riepr\/operationeel-afval\//);

    addField({ step: 'operationeel_afval', code: 'geproduceerd', prefLabel: 'Afval geproduceerd?', datatype: 'xsd:boolean', dryRun: false });
    addField({ step: 'operationeel_afval', code: 'stof', prefLabel: 'Afvalstof', isMeervoudig: true, conditionPath: 'afval:geproduceerd', conditionValue: 'true', dryRun: false });
    // The first field of an empty step is marked _ui_first; the next one follows it.
    assert.match(line('operationeel_afval.csv', 'afval:geproduceerd')!, /,,true,$/);
    assert.match(line('operationeel_afval.csv', 'afval:stof')!, /,afval:geproduceerd,,$/);
    const flow = listFlows().flows.find(f => f.id === 'thema:afval')!;
    assert.deepEqual(flow.steps.map(s => s.id), ['conceptscheme:operationeel_afval']);
    assert.throws(() => addFlow({ code: 'status', prefLabel: 'Status' }), /context\.json/);
    assert.equal(validateFlows().errors, validateFlowsBaseline);
});

test('add_field appends after the last ordered sibling and checks references', () => {
    addField({ step: 'lucht_rapportering', code: 'brandstof_dichtheid', parent: 'lucht:brandstof', prefLabel: 'Dichtheid', datatype: 'xsd:decimal', relation: 'qudt:numericValue', dryRun: false });
    assert.match(line('operationeel_lucht.csv', 'lucht:brandstof_dichtheid')!, /,lucht:brandstof_verbruik,$/);
    const parts = getStep({ step: 'lucht_rapportering' }).fields[0].parts!.map(p => p.id);
    assert.equal(parts.at(-1), 'lucht:brandstof_dichtheid');

    const base = { step: 'operationeel_grondwater', prefLabel: 'X' };
    assert.throws(() => addField({ ...base, code: 'x1', parent: 'lucht:brandstof' }), /not a field of/);
    assert.throws(() => addField({ ...base, code: 'x2', conditionPath: 'grondwater:pomptoestand', conditionValue: 'pomptoestand:kapot' }), /not an option/);
    assert.throws(() => addField({ ...base, code: 'x3', seeAlso: ['conceptscheme:bestaat_niet'] }), /not a step/);
    assert.throws(() => addField({ ...base, code: 'x4', uiAfter: 'lucht:brandstof' }), /not a sibling/);
    assert.throws(() => addField({ ...base, code: 'x5', datatype: 'xsd:string', unit: ['csor_eenheid:E_59'] }), /numeric/);
});

test('related variants are kept symmetric', () => {
    addField({
        step: 'operationeel_grondstoffen', code: 'bestemmingsidentificatie-eu', parent: 'grondstoffen:grondstof', prefLabel: 'Bestemmingsidentificatie',
        conditionPath: 'grondstoffen:grondstof_bestemming_type', conditionValue: 'bestemming:buitenlands',
        related: ['grondstoffen:bestemmingsidentificatie-be'], dryRun: false,
    });
    assert.match(line('operationeel_grondstoffen.csv', 'grondstoffen:bestemmingsidentificatie-be')!, /grondstoffen:bestemmingsidentificatie-eu$/);
    deleteField({ field: 'grondstoffen:bestemmingsidentificatie-eu', dryRun: false });
    assert.doesNotMatch(read('operationeel_grondstoffen.csv'), /bestemmingsidentificatie-eu/);
});

test('delete_field keeps the ordering of the remaining siblings and refuses used triggers', () => {
    deleteField({ field: 'lucht:brandstof_s', dryRun: false });
    assert.match(line('operationeel_lucht.csv', 'lucht:brandstof_as')!, /,lucht:brandstof_naam,$/);
    deleteField({ field: 'grondwater:onttrekking', dryRun: false });
    assert.equal(line('operationeel_grondwater.csv', 'grondwater:volume'), undefined);
    assert.match(line('operationeel_grondwater.csv', 'grondwater:peilmeting')!, /,true$/);
    assert.throws(() => deleteField({ field: 'grondstoffen:geproduceerd' }), /conditionPath/);
});

test('reorder_fields rewrites _ui_first/_ui_after', () => {
    reorderFields({ step: 'operationeel_grondwater', order: ['grondwater:kwaliteitsmeting', 'grondwater:onttrekking', 'grondwater:peilmeting'], dryRun: false });
    assert.deepEqual(getStep({ step: 'operationeel_grondwater' }).fields.map(f => f.id), ['grondwater:kwaliteitsmeting', 'grondwater:onttrekking', 'grondwater:peilmeting']);
    assert.throws(() => reorderFields({ step: 'operationeel_grondwater', order: ['grondwater:peilmeting'] }), /exactly once/);
});

test('steps: add with a link, refuse to delete while linked unless unlink', () => {
    assert.throws(() => addStep({ name: 'operationeel_lucht_extra', from: 'lucht:feature_bron' }), /replaceNext/);
    addStep({ name: 'operationeel_water_extra', prefLabel: 'Extra', from: 'water:lozing-concentratie', dryRun: false });
    assert.match(line('operationeel_water.csv', 'water:lozing-concentratie')!, /conceptscheme:operationeel_water_extra/);
    assert.throws(() => deleteStep({ step: 'operationeel_water_extra' }), /unlink=true/);
    deleteStep({ step: 'operationeel_water_extra', unlink: true, dryRun: false });
    assert.doesNotMatch(read('operationeel_water.csv'), /operationeel_water_extra/);
});

test('update_flow_item edits fields, steps and themas within their allowed properties', () => {
    updateFlowItem({ id: 'grondwater:type-debiet', set: { isVerplicht: true }, dryRun: false });
    assert.equal(getOperationalConcept({ concept: 'grondwater:type-debiet' }).ui?.required, true);
    updateFlowItem({ id: 'conceptscheme:operationeel_lucht_bron', set: { prefLabel: 'Bronnen' }, dryRun: false });
    assert.match(getFlow({ flow: 'lucht' }).outline, /Stap 2: Bronnen/);
    updateFlowItem({ id: 'thema:lucht', set: { prefLabel: 'Lucht (emissies)' }, dryRun: false });
    assert.throws(() => updateFlowItem({ id: 'conceptscheme:operationeel_lucht_bron', set: { datatype: 'xsd:string' } }), /only prefLabel, definition/);
    assert.throws(() => updateFlowItem({ id: 'lucht:brandstof_naam', set: { code: 'x' } as never }), /published URI/);
});

test('add_flow_collection and variabele: a value field points to the field where its stof is selected', () => {
    addFlowCollection({ name: 'test_stoffen', prefLabel: 'Teststoffen', members: ['csor_variabele:V_424', 'csor_variabele:V_46'], dryRun: false });
    assert.match(read('operationeel_misc.csv'), /\ncollectie:test_stoffen,skos:Collection,/);
    assert.match(read('operationeel_misc.csv'), /\ncsor_variabele:V_46,[^\n]*collectie:test_stoffen/);
    assert.throws(() => addFlowCollection({ name: 'test_stoffen', members: ['csor_variabele:V_46'], extend: true }), /already a member/);
    addFlowCollection({ name: 'test_stoffen', members: ['csor_variabele:V_231'], extend: true, dryRun: false });

    assert.throws(() => updateFlowItem({ id: 'water:lozing-jaarvracht', set: { variabele: 'water:lozing-debiet' } }), /has no relevantCodeList/);
    assert.throws(() => updateFlowItem({ id: 'water:lozing-jaarvracht', set: { variabele: 'grondwater:volume' } }), /not a field of/);
    updateFlowItem({ id: 'water:lozing-stof', set: { codeList: ['collectie:test_stoffen'], relevantRiepr: null }, dryRun: false });
    updateFlowItem({ id: 'water:lozing-jaarvracht', set: { variabele: null }, dryRun: false });
    updateFlowItem({ id: 'water:lozing-jaarvracht', set: { variabele: 'water:lozing-stof', drager: 'csor_drager:DR_1' }, dryRun: false });
    const header = read('operationeel_water.csv').split('\n')[0].split(',');
    assert.equal(header[header.indexOf('soortWaartbepaling') + 1], 'variabele');
    const rows = read('operationeel_water.csv').split('\n');
    // Every row keeps its cells under the right column after the column is inserted.
    const jaarvracht = rows.find(l => l.startsWith('water:lozing-jaarvracht,'))!.split(',');
    assert.equal(jaarvracht[header.indexOf('variabele')], 'water:lozing-stof');
    assert.equal(jaarvracht[header.indexOf('_ui_after')], 'water:lozing-concentratie');
    assert.equal(getOperationalConcept({ concept: 'water:lozing-jaarvracht' }).ui?.semantics?.variabele, 'water:lozing-stof');
    assert.deepEqual(getOperationalConcept({ concept: 'water:lozing-stof' }).ui?.options?.items?.map(i => i.id), ['csor_variabele:V_424', 'csor_variabele:V_46', 'csor_variabele:V_231']);
});
