import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schemaObject, personalizeReferenceSchema, referenceSnapshot } from 'codelijst-rie-iepr-poc-json-schema';
import { compileGroundwater } from '../../poc-json-schema/tests/groundwater-csv-fixture.js';
import { sourceSnapshot } from '../../poc-json-schema/scripts/source-snapshot.mjs';
import { compileTabularPlan, hash } from '../src/services/tabular-plan.js';
import { layoutColumns } from '../src/services/workbook-layout.js';
import { machineColumns } from '../src/services/json-mapping.js';
import { generationFixture } from '../src/services/generation-fixture.js';
import { workbookMetadata } from '../src/services/workbook-metadata.js';
import { ODSGenerator } from '../src/services/ods-generator.js';
import { ODSImporter } from '../src/services/ods-importer.js';
import { CodelistEnricher } from '../src/services/codelist-enricher.js';
import { readOdf, odfCell, columnLetter } from '../src/services/odf.js';
import { cells, row, modifyTable } from './fixtures.js';

const sections = compileGroundwater().subSchemas;
const plans = sections.map(section => compileTabularPlan(section.schema, { sourceSha256: hash('synthetic groundwater CSV') }));
const references = [
  { id: 'urn:synthetic:filter:1', label: 'Filter 1', types: ['https://example.test/meetpunten/filter'] },
  { id: 'urn:synthetic:filter:2', label: 'Filter 2', types: ['https://example.test/meetpunten/filter'] },
];

describe('Groundwater CSV -> JSON Schema -> ODS', () => {
  it.each(['onttrekking', 'peilmeting', 'kwaliteitsmeting'])('uses embedded personal reference enums and labels for %s without a separate lookup input', async name => {
    const section = compileGroundwater(JSON.parse(sourceSnapshot())).subSchemas.find(section => section.name === name)!;
    const references = JSON.parse(readFileSync(new URL('../../poc-json-schema/examples/refs.json', import.meta.url), 'utf8'));
    const schema = personalizeReferenceSchema(section.schema, { references, referenceContext: { year: 2024 } });
    const plan = compileTabularPlan(schema, { sourceSha256: hash(sourceSnapshot()) });
    const data = JSON.parse(readFileSync(new URL(`../../poc-json-schema/examples/grondwater/${name}.json`, import.meta.url), 'utf8'));
    const workbook = await new ODSGenerator().generate({ plan, data });
    expect(await new ODSImporter().import(workbook, plan)).toEqual(data);
    const tables = await readOdf(workbook);
    const metadata = workbookMetadata(JSON.parse(tables.find(table => table.name === '_riepr')!.rows
      .slice(1).map(row => row.cells[0].text).join('')));
    expect(metadata.references).toEqual(referenceSnapshot(schema)!.references);
    expect(metadata.referenceContext).toEqual({ year: 2024 });
    const referenceIds = new Set(metadata.references.map(reference => reference.id));
    const referenceChoices = Object.values(metadata.lookups).flat().filter(choice => referenceIds.has(String(choice.value)));
    expect(referenceChoices.length).toBeGreaterThan(0);
    for (const choice of referenceChoices) {
      expect(choice.display).toBe(metadata.references.find(reference => reference.id === choice.value)!.label);
    }
    const invalid = structuredClone(data);
    invalid[name][0].hasFeatureOfInterest = name === 'kwaliteitsmeting' ? ['urn:unknown'] : 'urn:unknown';
    await expect(new ODSGenerator().generate({ plan, data: invalid })).rejects.toThrow();
  });

  it('uses fixed dropdown ranges, Teepak-style headers and 1000 formatted input rows', async () => {
    const refs = JSON.parse(readFileSync(new URL('../../poc-json-schema/examples/refs.json', import.meta.url), 'utf8'));
    for (const section of compileGroundwater(JSON.parse(sourceSnapshot())).subSchemas) {
      const plan = compileTabularPlan(section.schema, { sourceSha256: hash(sourceSnapshot()) });
      const workbook = await new ODSGenerator().generate({ plan, references: refs });
      const xml = await (await JSZip.loadAsync(workbook)).file('content.xml')!.async('string');
      const doc = new XMLParser({ ignoreAttributes: false, parseAttributeValue: false }).parse(xml)['office:document-content'];
      const spreadsheet = doc['office:body']['office:spreadsheet'];
      const validations = spreadsheet['table:content-validations']['table:content-validation'];
      expect(validations.length).toBeGreaterThan(0);
      for (const validation of validations) {
        expect(validation['@_table:condition']).toMatch(/^of:cell-content-is-in-list\(\[\$'[^']+'\.\$[A-Z]+\$\d+:\.\$[A-Z]+\$\d+\]\)$/);
        expect(validation['@_table:base-cell-address']).toMatch(/^\$'[^']+'\.\$A\$1$/);
        expect(validation['@_table:display-list']).toBe('unsorted');
      }
      const styles = doc['office:automatic-styles']['style:style'];
      const header = styles.find((style: Record<string, unknown>) => style['@_style:name'] === 'headerCell');
      expect(header['style:table-cell-properties']['@_fo:background-color']).toBe('#447A6D');
      expect(header['style:text-properties']['@_fo:color']).toBe('#FFFFFF');
      expect(header['style:text-properties']['@_fo:font-weight']).toBe('bold');
      expect(header['style:table-cell-properties']['@_fo:wrap-option']).toBe('wrap');
      for (const record of plan.records.filter(record => record.id !== 'root')) {
        const table = spreadsheet['table:table'].find((table: Record<string, unknown>) => table['@_table:name'] === record.sheetName);
        const rows = table['table:table-row'];
        expect(rows[2]['@_table:style-name']).toBe('headerRow');
        expect(rows[2]['table:table-cell'].every((cell: Record<string, unknown>) => cell['@_table:style-name'] === 'headerCell')).toBe(true);
        expect(rows.slice(3).reduce((total: number, row: Record<string, string>) => total + Number(row['@_table:number-rows-repeated'] ?? 1), 0)).toBe(1000);
        const columns = table['table:table-column'];
        expect(columns.every((column: Record<string, string>) => column['@_table:style-name'].startsWith('column'))).toBe(true);
      }
      if (section.name === 'kwaliteitsmeting') {
        const parent = validations.find((validation: Record<string, string>) => validation['@_table:name'].startsWith('parent_'));
        expect(parent['@_table:condition']).toBe("of:cell-content-is-in-list([$'Monsters'.$B$4:.$B$1003])");
        const monster = spreadsheet['table:table'].find((table: Record<string, string>) => table['@_table:name'] === 'Meetresultaten');
        expect(monster['table:table-row'][3]['table:table-cell'][0]['@_table:content-validation-name']).toBe(parent['@_table:name']);
        const multiple = validations.filter((validation: Record<string, unknown>) => validation['table:help-message']);
        expect(multiple).toHaveLength(2);
        for (const validation of multiple) {
          expect(validation['table:error-message']['@_table:message-type']).toBe('warning');
        }
      }
    }
  });

  it('uses prefLabels for scalar CSV concept types as well as published type arrays', () => {
    const directory = mkdtempSync(join(tmpdir(), 'groundwater-labels-'));
    try {
      const file = join(directory, 'source.jsonld');
      writeFileSync(file, sourceSnapshot());
      const labels = new CodelistEnricher(file);
      expect(labels.resolve('https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-debiettype/onttrekking'))
        .toMatchObject({ resolved: true, displayLabel: 'Onttrekking' });
      expect(labels.resolve('https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-pomptoestand/werking'))
        .toMatchObject({ resolved: true, displayLabel: 'In werking' });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(['onttrekking', 'peilmeting', 'kwaliteitsmeting'])('round-trips the actual CSV schema and persistent %s example', async name => {
    const section = compileGroundwater(JSON.parse(sourceSnapshot())).subSchemas.find(section => section.name === name)!;
    const plan = compileTabularPlan(section.schema, { sourceSha256: hash(sourceSnapshot()) });
    const data = JSON.parse(readFileSync(new URL(`../../poc-json-schema/examples/grondwater/${name}.json`, import.meta.url), 'utf8'));
    const references = JSON.parse(readFileSync(new URL('../../poc-json-schema/examples/refs.json', import.meta.url), 'utf8'));
    const workbook = await new ODSGenerator().generate({ plan, data, references, referenceContext: { year: 2024 } });
    expect(await new ODSImporter().import(workbook, plan)).toEqual(data);
    expect(plan.records.map(record => record.sheetName)).toEqual(name === 'kwaliteitsmeting'
      ? ['Voorblad', 'Monsters', 'Meetresultaten'] : ['Voorblad', name === 'onttrekking' ? 'Debieten' : 'Peilmetingen']);
  });

  it('uses the declared files and sheets, keeping scalar collections in their declared sheet', () => {
    expect(sections.map(section => section.schema['x-table-workbook'])).toEqual([
      'grondwater-debieten.ods', 'grondwater-peilmetingen.ods', 'grondwater-kwaliteitsanalyses.ods',
    ]);
    expect(plans.map(plan => plan.records.map(record => record.sheetName))).toEqual([
      ['Voorblad', 'Debieten'], ['Voorblad', 'Peilmetingen'], ['Voorblad', 'Monsters', 'Meetresultaten'],
    ]);
  });

  it('round-trips multiple reference-point PropertyValues in one Monsters selection cell', async () => {
    const section = compileGroundwater(JSON.parse(sourceSnapshot())).subSchemas.find(section => section.name === 'kwaliteitsmeting')!;
    const plan = compileTabularPlan(section.schema, { sourceSha256: hash(sourceSnapshot()) });
    const fixture = (await generationFixture(plan))!;
    const data = JSON.parse(JSON.stringify(fixture.data));
    const reference = {
      id: 'urn:test:referentiepunt:buis', label: 'Bovenkant peilbuis', year: 2024,
      types: ['https://data.omgeving.vlaanderen.be/id/concept/riepr/meetpunteigenschappen/referentiepunt'],
    };
    const first = data.kwaliteitsmeting[0].additionalProperty[0];
    data.kwaliteitsmeting[0].additionalProperty.push({ propertyID: first.propertyID, value: reference.id });
    const workbook = await new ODSGenerator().generate({
      plan, ...fixture, data, references: [...fixture.references, reference],
    });
    expect(await new ODSImporter().import(workbook, plan)).toEqual(data);
    expect(plan.records.map(record => record.sheetName)).toEqual(['Voorblad', 'Monsters', 'Meetresultaten']);
  });

  it('physically omits technical and constant identity columns, not just hiding them', async () => {
    const forbidden = ['Rij-ID', 'Bovenliggende rij-ID', 'Containers', 'Referentie', 'Bovenliggende referentie',
      'Entiteits-ID', 'observedProperty', 'propertyID', '_row_id', '_parent_id', '_containers', '_ref'];
    const actual = compileGroundwater(JSON.parse(sourceSnapshot())).subSchemas;
    const refs = JSON.parse(readFileSync(new URL('../../poc-json-schema/examples/refs.json', import.meta.url), 'utf8'));
    for (const section of actual) {
      const plan = compileTabularPlan(section.schema, { sourceSha256: hash(sourceSnapshot()) });
      const workbook = await new ODSGenerator().generate({ plan, references: refs });
      const tables = await readOdf(workbook);
      for (const record of plan.records) {
        const table = tables.find(table => table.name === record.sheetName)!;
        const headers = table.rows.find(row => row.number === 3)?.cells.map(cell => cell.text) ?? [];
        for (const name of forbidden) expect(headers).not.toContain(name);
        const machine = table.rows.find(row => row.number === 2)?.cells.map(cell => cell.text) ?? [];
        expect(machine).toEqual(machineColumns(plan, record.id));
        if (record.sheetName === 'Meetresultaten') {
          expect(headers[0]).toBe('Monster');
          expect(headers[1]).toBe('Parameter *');
        } else expect(machine).not.toContain('_parent_ref');
        const ids = layoutColumns(plan, record);
        for (const [index] of machine.entries()) {
          const definition = record.columns.find(column => column.id === ids[index]);
          if (!['hasUnit', 'unitCode'].includes(definition?.path.at(-1) ?? '')) continue;
          expect(headers[index]).toMatch(/^Eenheid/);
          const value = record.columns.find(candidate => candidate.id === ids[index - 1])!;
          expect(value.path.slice(0, -1)).toEqual(definition!.path.slice(0, -1));
        }
      }
    }
  });

  it.each(['onttrekking', 'peilmeting', 'kwaliteitsmeting'])('validates blank %s generation against dummy JSON without leaking it', async name => {
    const section = compileGroundwater(JSON.parse(sourceSnapshot())).subSchemas.find(section => section.name === name)!;
    const plan = compileTabularPlan(section.schema, { sourceSha256: hash(sourceSnapshot()) });
    const references = JSON.parse(readFileSync(new URL('../../poc-json-schema/examples/refs.json', import.meta.url), 'utf8'));
    const validationData = await generationFixture(plan);
    expect(validationData).toBeDefined();
    const workbook = await new ODSGenerator().generate({ plan, references, validationData });
    const tables = await readOdf(workbook);
    for (const record of plan.records.filter(record => record.id !== 'root')) {
      expect(tables.find(table => table.name === record.sheetName)!.rows
        .filter(row => row.number >= 4).flatMap(row => row.cells).some(cell => cell.text.includes('Synthetisch'))).toBe(false);
    }
    await expect(new ODSGenerator().generate({
      plan, references, validationData: { ...validationData!, data: { [name]: [{ invalid: true }] } },
    })).rejects.toThrow();
  });

  it('exposes JSON pointers for cells, records and parents instead of opaque record markers', async () => {
    const section = compileGroundwater(JSON.parse(sourceSnapshot())).subSchemas.find(section => section.name === 'kwaliteitsmeting')!;
    const plan = compileTabularPlan(section.schema, { sourceSha256: hash(sourceSnapshot()) });
    const references = JSON.parse(readFileSync(new URL('../../poc-json-schema/examples/refs.json', import.meta.url), 'utf8'));
    const data = (await generationFixture(plan))!;
    const workbook = await new ODSGenerator().generate({ plan, references, data: data.data, referenceContext: data.referenceContext });
    const tables = await readOdf(workbook);
    const results = tables.find(table => table.name === 'Meetresultaten')!;
    expect(results.rows.find(row => row.number === 1)!.cells[0].text).toBe('/kwaliteitsmeting/*/hasMember/*');
    expect(results.rows.find(row => row.number === 2)!.cells.map(cell => cell.text)).toContain('/hasResult/numericValue');
    const metadata = workbookMetadata(JSON.parse(tables.find(table => table.name === '_riepr')!.rows.slice(1).map(row => row.cells[0].text).join('')));
    const result = Object.values(metadata.rows).find(row => row.instancePath === '/kwaliteitsmeting/0/hasMember/1');
    expect(result?.parentInstancePath).toBe('/kwaliteitsmeting/0');
    const mapping = metadata.jsonMapping[plan.records.find(record => record.sheetName === 'Meetresultaten')!.id];
    expect(mapping.parentIdentifierPath).toBe('/kwaliteitsmeting/*/identifier');
    const monster = tables.find(table => table.name === 'Monsters')!;
    const monsterPaths = monster.rows.find(row => row.number === 2)!.cells.map(cell => cell.text);
    expect(monsterPaths).toContain('/wasAssociatedWith/label');
    expect(monsterPaths).toContain(
      '$["additionalProperty"][?(@.propertyID == "https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-grondwater/kwaliteitsmeting-referentiepunt")]["value"]',
    );
    expect(monsterPaths).toContain(
      '$["hasMember"][?(@.observedProperty == "https://data.omgeving.vlaanderen.be/id/concept/riepr/operationeel-grondwater/kwaliteitsmeting-diepte")]["hasResult"]["numericValue"]',
    );
    expect(await new ODSImporter().import(workbook, plan)).toEqual(data.data);
    const xml = await (await JSZip.loadAsync(workbook)).file('content.xml')!.async('string');
    expect(xml).not.toContain('@record:');
  });

  it('imports new monsters and results through the monsternummer alone, with no technical columns', async () => {
    const plan = plans[2];
    let workbook = await new ODSGenerator().generate({ plan, references });
    const monsters = plan.records.find(record => record.sheetName === 'Monsters')!;
    const results = plan.records.find(record => record.sheetName === 'Meetresultaten')!;
    workbook = await modifyTable(workbook, 'Monsters', rows => {
      const columns = cells(rows[3]);
      const identifier = monsters.columns.find(column => column.path.join('/') === 'identifier')!;
      columns[layoutColumns(plan, monsters).indexOf(identifier.id)] = odfCell('0007');
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    workbook = await modifyTable(workbook, 'Meetresultaten', rows => {
      const columns = cells(rows[3]);
      columns[0] = odfCell('0007');
      for (const [path, value] of [
        ['observedProperty', 'https://example.test/parameters/a'], ['hasResult/numericValue', 0],
        ['hasResult/hasUnit', 'https://example.test/units/mgL'],
      ] as const) {
        const column = results.columns.find(column => column.path.join('/') === path)!;
        columns[layoutColumns(plan, results).indexOf(column.id)] = odfCell(value, column);
      }
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    expect(await new ODSImporter().import(workbook, plan)).toEqual({ kwaliteitsmeting: [{
      identifier: '0007', hasMember: [{
        observedProperty: 'https://example.test/parameters/a',
        hasResult: { numericValue: 0, hasUnit: 'https://example.test/units/mgL' },
      }],
    }] });
    const orphan = await modifyTable(workbook, 'Meetresultaten', rows => {
      const columns = cells(rows[3]);
      columns[0] = odfCell('missing');
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    await expect(new ODSImporter().import(orphan, plan)).rejects.toThrow('Missing/orphan parent reference');
  });

  it('keeps monster links when rows are sorted and business values are edited', async () => {
    const plan = plans[2];
    const data = { kwaliteitsmeting: ['0001', '0002'].map((identifier, index) => ({
      identifier, wasAssociatedWith: { label: `Labo ${index}` },
      hasMember: [{
        observedProperty: 'https://example.test/parameters/a',
        hasResult: { numericValue: index, hasUnit: 'https://example.test/units/mgL' },
      }],
    })) };
    let workbook = await new ODSGenerator().generate({ plan, data, references });
    workbook = await modifyTable(workbook, 'Monsters', rows => [...rows.slice(0, 3), rows[4], rows[3], ...rows.slice(5)]);
    const result = plan.records.find(record => record.sheetName === 'Meetresultaten')!;
    const value = result.columns.find(column => column.path.join('/') === 'hasResult/numericValue')!;
    workbook = await modifyTable(workbook, 'Meetresultaten', rows => {
      const columns = cells(rows[3]);
      columns[layoutColumns(plan, result).indexOf(value.id)] = odfCell(12.125, value);
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    const expected = structuredClone(data);
    expected.kwaliteitsmeting[0].hasMember[0].hasResult.numericValue = 12.125;
    expected.kwaliteitsmeting.reverse();
    expect(await new ODSImporter().import(workbook, plan)).toEqual(expected);
    const duplicate = structuredClone(data);
    duplicate.kwaliteitsmeting[1].identifier = '0001';
    await expect(new ODSGenerator().generate({ plan, data: duplicate, references })).rejects.toThrow('must be filled and unique');
  });

  it('recomputes hidden shared dates after editing the single visible Einddatum', async () => {
    const plan = plans[0];
    const record = schemaObject(schemaObject(plan.presentationSchema.properties!.onttrekking).items);
    const reading = (name: string, value: number) => ({
      observedProperty: schemaObject(schemaObject(record.properties![name]).properties!.observedProperty).const,
      resultTime: '2024-12-30',
      hasResult: { numericValue: value, hasUnit: 'https://example.test/units/m3' },
    });
    const data = { onttrekking: [{ hasMember: [reading('eindmeterstand', 150), reading('hoeveelheid', 0)] }] };
    let workbook = await new ODSGenerator().generate({ plan, data, label: value => value.split('/').at(-1)! });
    const debit = plan.records.find(record => record.sheetName === 'Debieten')!;
    const date = debit.columns.find(column => column.path.join('/') === 'hoeveelheid/resultTime')!;
    workbook = await modifyTable(workbook, 'Debieten', rows => {
      const columns = cells(rows[3]);
      columns[layoutColumns(plan, debit).indexOf(date.id)] = odfCell('2024-12-31', date);
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    const expected = structuredClone(data);
    expected.onttrekking[0].hasMember.forEach(member => { member.resultTime = '2024-12-31'; });
    expect(await new ODSImporter().import(workbook, plan)).toEqual(expected);
    const quantity = debit.columns.find(column => column.path.join('/') === 'hoeveelheid/hasResult/numericValue')!;
    const index = layoutColumns(plan, debit).indexOf(quantity.id);
    const incomplete = await modifyTable(workbook, 'Debieten', rows => {
      const columns = cells(rows[3]);
      columns[index] = '<table:table-cell/>';
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    await expect(new ODSImporter().import(incomplete, plan)).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({
        instancePath: '/onttrekking/0/hasMember/1/hasResult/numericValue',
        sheet: 'Debieten', row: 4, column: columnLetter(index),
      })]),
    });
  });

  it('puts every unit immediately to the right of its numeric value, with exact source headings', () => {
    for (const plan of plans) for (const record of plan.records) {
      for (const [index, column] of record.columns.entries()) {
        if (column.path.at(-1) !== 'numericValue') continue;
        expect(record.columns[index + 1].title).toBe('Eenheid');
        expect(record.columns[index + 1].path.at(-1)).toBe('hasUnit');
      }
    }
    const result = plans[2].records.find(record => record.sheetName === 'Meetresultaten')!;
    expect(result.columns.map(column => column.title).slice(0, 3)).toEqual(['Meetwaarde', 'Eenheid', 'Detectielimiet']);
    expect(result.columns[1].schema.enum).toHaveLength(2);
  });

  it('round-trips numeric quality results, selectable units, hidden lab structure and multiple inline filters', async () => {
    const plan = plans[2];
    const data = {
      kwaliteitsmeting: [{
        identifier: '0001', hasFeatureOfInterest: references.map(reference => reference.id),
        wasAssociatedWith: { label: 'Synthetisch laboratorium' },
        hasMember: [0, 1.234567890123].map((numericValue, index) => ({
          observedProperty: `https://example.test/parameters/${index ? 'b' : 'a'}`,
          hasResult: { numericValue, hasUnit: `https://example.test/units/${index ? 'gL' : 'mgL'}`, limiet: 'onder' },
        })),
      }],
    };
    const workbook = await new ODSGenerator().generate({ plan, data, references, label: value => value.split('/').at(-1)! });
    expect(await new ODSImporter().import(workbook, plan)).toEqual(data);
    const tables = await readOdf(workbook);
    expect(tables.map(table => table.name)).toEqual(['Voorblad', 'Monsters', 'Meetresultaten', 'Keuzelijsten', '_riepr']);
    const names = tables.find(table => table.name === 'Monsters')!.rows.find(row => row.number === 3)!;
    expect(names.cells.map(cell => cell.text)).toContain('Labo naam');
    expect(names.cells.map(cell => cell.text)).not.toContain('Labo');
    const choices = tables.find(table => table.name === 'Keuzelijsten')!;
    expect(choices.rows.some(row => row.cells.some(cell => cell.text === 'mgL'))).toBe(true);
    const record = plan.records.find(record => record.sheetName === 'Meetresultaten')!;
    const unitIndex = record.columns.findIndex(column => column.title === 'Eenheid');
    const invalid = await modifyTable(workbook, record.sheetName, rows => {
      const columns = cells(rows[3]);
      columns[layoutColumns(plan, record).indexOf(record.columns[unitIndex].id)] = odfCell('not-a-unit');
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    await expect(new ODSImporter().import(invalid, plan)).rejects.toThrow('Unknown or ambiguous selection');
  });

  it('requires no meter readings to enter an end date for a reported quantity', async () => {
    const plan = plans[0];
    const record = schemaObject(schemaObject(plan.presentationSchema.properties!.onttrekking).items);
    const amount = schemaObject(record.properties!.hoeveelheid);
    const data = { onttrekking: [{
      hasMember: [{
        observedProperty: schemaObject(amount.properties!.observedProperty).const,
        resultTime: '2024-12-31',
        hasResult: { numericValue: 0, hasUnit: 'https://example.test/units/m3' },
      }],
    }] };
    const workbook = await new ODSGenerator().generate({ plan, data });
    expect(await new ODSImporter().import(workbook, plan)).toEqual(data);
  });

  it('keeps reference arrays as a real array after a single dropdown selection', async () => {
    const plan = plans[2];
    const data = { kwaliteitsmeting: [{
      identifier: '0001', hasFeatureOfInterest: [references[0].id],
      hasMember: [{
        observedProperty: 'https://example.test/parameters/a',
        hasResult: { numericValue: 0, hasUnit: 'https://example.test/units/mgL' },
      }],
    }] };
    const workbook = await new ODSGenerator().generate({ plan, data, references });
    expect(await new ODSImporter().import(workbook, plan)).toEqual(data);
  });
});
