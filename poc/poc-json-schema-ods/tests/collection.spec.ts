import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { schemaObject } from 'codelijst-rie-iepr-poc-json-schema';
import { CodelistParser } from '../../poc-json-schema/src/services/codelist-parser.js';
import { ThemeResolver } from '../../poc-json-schema/src/services/theme-resolver.js';
import { ConceptMapper } from '../../poc-json-schema/src/services/concept-mapper.js';
import { ChainComposer } from '../../poc-json-schema/src/services/chain-composer.js';
import { CompositeGroupBuilder } from '../../poc-json-schema/src/services/composite-group-builder.js';
import { SchemaAssembler } from '../../poc-json-schema/src/services/schema-assembler.js';
import { compileTabularPlan, hash } from '../src/services/tabular-plan.js';
import { ODSGenerator } from '../src/services/ods-generator.js';
import { ODSImporter } from '../src/services/ods-importer.js';
import { readOdf, odfCell, columnLetter } from '../src/services/odf.js';
import { cells, row, modifyTable } from './fixtures.js';

const sourcePath = fileURLToPath(new URL('../../../src/main/resources/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld', import.meta.url));
const content = readFileSync(sourcePath);
const result = new CodelistParser().parseData(JSON.parse(content.toString()));
const chain = new ThemeResolver().resolveAllThemes(result).get('Grondwater')!;
function sectionSchema(id: string) {
  const mapper = new ConceptMapper(result);
  const builder = new CompositeGroupBuilder(result, mapper);
  const fields = new ChainComposer().composeThemeFields(result, chain, mapper, id).fields;
  const nested = builder.buildNestedStructure(fields);
  return new SchemaAssembler({}).assemble('Grondwater', nested, null, chain, result).subSchemas[0].schema;
}

const schema = sectionSchema('grondwater:kwaliteitsmeting');
const plan = compileTabularPlan(schema, { sourceSha256: hash(content) });
const measurement = schemaObject(schemaObject(schema.properties!.kwaliteitsmeting).items);
const member = schemaObject(schemaObject(measurement.properties!.hasMember).items);
const sample = schemaObject(measurement.properties!.hasFeatureOfInterest);
const sampling = schemaObject(sample.properties!.isResultOf);
const filter = schemaObject(schemaObject(sampling.properties!.hasFeatureOfInterest).items);
const point = schemaObject(schemaObject(sampling.properties!.kwaliteitsmetingReferentiepunt).items);
const references = [
  { id: 'urn:synthetic:filter', label: 'Synthetische filter', types: filter['x-reference-types'] as string[] },
  { id: 'urn:synthetic:reference-point', label: 'Synthetisch referentiepunt', types: point['x-reference-types'] as string[] },
];

function data() {
  return {
    kwaliteitsmeting: [1, 2].map(n => ({
      '@id': `urn:synthetic:analysis:${n}`,
      kwaliteitsmetingLabo: { kwaliteitsmetingLaboNaam: 'Synthetisch laboratorium' },
      hasFeatureOfInterest: {
        '@id': `urn:synthetic:sample:${n}`, identifier: `000${n}`,
        isResultOf: {
          resultTime: '2024-01-02T10:00:00Z',
          hasFeatureOfInterest: ['urn:synthetic:filter'],
          kwaliteitsmetingReferentiepunt: ['urn:synthetic:reference-point'],
        },
      },
      hasMember: [0, 0.1234567890123].map((numericValue, index) => ({
        resultTime: '2024-01-03T11:00:00Z',
        observedProperty: schemaObject(member.properties!.observedProperty).enum![index],
        kwaliteitsmetingParameterLimiet: schemaObject(member.properties!.kwaliteitsmetingParameterLimiet).enum![index],
        hasResult: {
          numericValue,
          hasUnit: schemaObject(schemaObject(member.properties!.hasResult).properties!.hasUnit).const,
        },
      })),
    })),
  };
}

describe('Actual code lists -> groundwater schema -> ODS -> JSON', () => {
  it('derives one workbook, one repeated monster/quality row set and linked parameters without adding a monster layer', () => {
    expect(plan.records.map(record => record.title)).toEqual([
      'Kwaliteitsmeting', 'Kwaliteitsmeting', 'Peilfilter/Pompfilter', 'Referentiepunt', 'Parameter',
    ]);
    expect(plan.records[1].columns.some(column => column.path.join('/') === 'hasFeatureOfInterest/identifier')).toBe(true);
    expect(plan.records[4].parentId).toBe(plan.records[1].id);
    expect(plan.records.some(record => record.title === 'Monstername' || record.title === 'Monster')).toBe(false);
    expect(schemaObject(member.properties!.hasResult)['x-variabele']).toBe('observedProperty');
  });

  describe('Actual code lists -> debit schema -> ODS -> JSON', () => {
    const schema = sectionSchema('grondwater:onttrekking');
    const plan = compileTabularPlan(schema, { sourceSha256: hash(content) });
    const record = schemaObject(schemaObject(schema.properties!.onttrekking).items);
    const references = [{
      id: 'urn:synthetic:meter', label: 'Synthetische debietmeter',
      types: schemaObject(record.properties!.hasFeatureOfInterest)['x-reference-types'] as string[],
    }];
    const value = (name: string, numericValue: number) => {
      const observation = schemaObject(record.properties![name]);
      return {
        observedProperty: schemaObject(observation.properties!.observedProperty).const,
        hasResult: {
          numericValue,
          hasUnit: schemaObject(schemaObject(observation.properties!.hasResult).properties!.hasUnit).const,
        },
      };
    };

    it('round-trips required reported volumes and optional readings on one data sheet without calculations', async () => {
      const original = {
        onttrekking: [
          { hasFeatureOfInterest: references[0].id, volume: value('volume', 0) },
          {
            hasFeatureOfInterest: references[0].id,
            periode: { start: '2024-01-01', end: '2024-12-31' },
            type: schemaObject(record.properties!.type).enum![0],
            volume: value('volume', 10.1234567890123),
            begintoestand: value('begintoestand', 100),
            eindtoestand: value('eindtoestand', 150),
          },
          {
            periode: { start: '2024-01-02T10:00:00+02:00', end: '2024-02-02T11:00:00.123400Z' },
            volume: value('volume', 1),
          },
        ],
      };
      expect(plan.records.map(record => record.sheetName)).toEqual(['Voorblad', 'Onttrekking infiltratie']);
      const paths = plan.records[1].columns.map(column => column.path.join('/'));
      for (const name of ['volume', 'begintoestand', 'eindtoestand']) {
        expect(paths).toContain(`${name}/hasResult/numericValue`);
      }
      const workbook = await new ODSGenerator().generate({ plan, data: original, references });
      const xml = await (await JSZip.loadAsync(workbook)).file('content.xml')!.async('string');
      expect(xml).toContain('office:value-type="date" office:date-value="2024-01-01"');
      expect(xml).toContain('office:value-type="date" office:date-value="2024-12-31"');
      expect(xml).toContain('office:value-type="date" office:date-value="2024-01-02T10:00:00+02:00"');
      expect(await new ODSImporter().import(workbook, plan)).toEqual(original);
    });

    it('imports an untouched debit template without inventing required volume records', async () => {
      const workbook = await new ODSGenerator().generate({ plan, references });
      expect(await new ODSImporter().import(workbook, plan)).toEqual({});
    });
  });

  it('round-trips two monsters with multiple actual parameter results, references, timestamps, qualifiers and mg/L values', async () => {
    const original = data();
    const workbook = await new ODSGenerator().generate({
      plan, data: original, references,
      label: value => value.endsWith('/E_1') ? 'mg/L' : value,
    });
    expect(await new ODSImporter().import(workbook, plan)).toEqual(original);
    const tables = await readOdf(workbook);
    expect(tables.some(table => table.name === 'Voorblad')).toBe(true);
    expect(tables.some(table => table.name === 'Keuzelijsten')).toBe(true);
    const parentRows = tables.find(table => table.name === plan.records[1].sheetName)!.rows.filter(row => row.number >= 4 && row.cells[0].text);
    expect(parentRows.map(row => row.cells[3].text)).toEqual(['0001', '0002']);
    expect(parentRows.every(row => !row.cells[0].text.startsWith('urn:synthetic:'))).toBe(true);
    const parameterRows = tables.find(table => table.name === 'Parameter')!.rows.filter(row => row.number >= 4 && row.cells[0].text);
    expect(parameterRows.map(row => row.cells[4].text)).toEqual(['0001', '0001', '0002', '0002']);
  });

  it('creates an empty template with supplied structural choices, without adding fake observations on import', async () => {
    const workbook = await new ODSGenerator().generate({ plan, references });
    expect(await new ODSImporter().import(workbook, plan)).toEqual({});
  });

  it('retains the supplied year and parent context in metadata and reports changed scopes at the reference cell', async () => {
    const scopedReferences = [
      { ...references[0], parents: ['urn:synthetic:site'], year: 2024 },
      { ...references[1], parents: [references[0].id], year: 2024 },
    ];
    const original = data();
    const workbook = await new ODSGenerator().generate({
      plan, data: original, references: scopedReferences,
      referenceContext: { year: 2024, ids: ['urn:synthetic:site'] },
    });
    const importer = new ODSImporter();
    expect(await importer.import(workbook, plan)).toEqual(original);
    for (const [referenceContext, message] of [
      [{ year: 2025, ids: ['urn:synthetic:site'] }, 'reporting year'],
      [{ year: 2024, ids: ['urn:synthetic:other-site'] }, 'parent context'],
    ] as const) {
      await expect(importer.import(workbook, plan, {
        referenceContext: { year: referenceContext.year, ids: [...referenceContext.ids] },
      })).rejects.toMatchObject({
        diagnostics: expect.arrayContaining([expect.objectContaining({
          sheet: plan.records[2].sheetName, row: 4, column: 'F',
          instancePath: '/kwaliteitsmeting/0/hasFeatureOfInterest/isResultOf/hasFeatureOfInterest/0',
          message: expect.stringContaining(message),
        })]),
      });
    }
  });
});

describe('Actual code lists -> nested peilmeting result -> ODS -> JSON', () => {
  const schema = sectionSchema('grondwater:peilmeting');
  const plan = compileTabularPlan(schema, { sourceSha256: hash(content) });
  const record = schemaObject(schemaObject(schema.properties!.peilmeting).items);
  const cube = schemaObject(record.properties!.hasResult);
  const sheet = plan.records[1];
  const references = [
    { id: 'urn:synthetic:filter', label: 'Filter', types: schemaObject(record.properties!.hasFeatureOfInterest)['x-reference-types'] as string[] },
    { id: 'urn:synthetic:point', label: 'Referentiepunt', types: schemaObject(record.properties!.referentiepunt)['x-reference-types'] as string[] },
  ];
  const component = (name: string, value: string | number) => {
    const node = schemaObject(cube.properties![name]);
    return {
      propertyID: schemaObject(node.properties!.propertyID).const,
      value,
      ...(node.properties!.unitCode ? { unitCode: schemaObject(node.properties!.unitCode).const } : {}),
    };
  };
  const minimum = () => ({
    referentiepunt: references[1].id,
    hasResult: { numericValue: 0, hasUnit: schemaObject(cube.properties!.hasUnit).const },
  });
  const data = () => ({
    peilmeting: [
      {
        ...minimum(), hasFeatureOfInterest: references[0].id, resultTime: '2024-01-02T10:00:00.123400+02:00',
        hasResult: {
          ...minimum().hasResult, numericValue: -2.125,
          measurementMethod: schemaObject(cube.properties!.measurementMethod).enum![0],
          pomptoestand: component('pomptoestand', result.expandCurie!('pomptoestand:rust')),
          duurStil: component('duurStil', 'PT8H'),
          volumeRust: component('volumeRust', 0),
        },
      },
      {
        ...minimum(),
        hasResult: {
          ...minimum().hasResult,
          pomptoestand: component('pomptoestand', result.expandCurie!('pomptoestand:werking')),
          volumeWerking: component('volumeWerking', 0.1234567890123),
        },
      },
      minimum(),
    ],
  });

  it('inlines singleton result components on one measurement sheet and round-trips both states exactly', async () => {
    expect(plan.records.map(record => record.sheetName)).toEqual(['Voorblad', 'Peilmeting']);
    const paths = sheet.columns.map(column => column.path.join('/'));
    expect(paths).toContain('hasResult/numericValue');
    expect(paths).not.toContain('hasResult/numericValue/numericValue');
    for (const name of ['pomptoestand', 'duurStil', 'volumeRust', 'volumeWerking']) {
      expect(paths).toContain(`hasResult/${name}/value`);
    }
    const original = data();
    const workbook = await new ODSGenerator().generate({ plan, data: original, references });
    expect(await new ODSImporter().import(workbook, plan)).toEqual(original);
    const xml = await (await JSZip.loadAsync(workbook)).file('content.xml')!.async('string');
    expect(xml).toContain('office:time-value="PT8H"');
    expect(xml).toContain('office:value="0.1234567890123"');
  });

  it('does not create optional PropertyValues from prefilled identifiers/units in templates or new rows', async () => {
    const template = await new ODSGenerator().generate({ plan, references });
    expect(await new ODSImporter().import(template, plan)).toEqual({});
    const workbook = await modifyTable(template, sheet.sheetName, rows => {
      const columns = cells(rows[3]);
      for (const [path, value] of [['referentiepunt', 'Referentiepunt'], ['hasResult/numericValue', 0]] as const) {
        const index = sheet.columns.findIndex(column => column.path.join('/') === path);
        columns[5 + index] = odfCell(value, sheet.columns[index]);
      }
      return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
    });
    expect(await new ODSImporter().import(workbook, plan)).toEqual({ peilmeting: [minimum()] });
  });

  it('reports an inactive PropertyValue at the entered value cell, not its constant property identifier', async () => {
    const index = sheet.columns.findIndex(column => column.path.join('/') === 'hasResult/volumeWerking/value');
    const workbook = await modifyTable(
      await new ODSGenerator().generate({ plan, data: data(), references }), sheet.sheetName, rows => {
        const columns = cells(rows[3]);
        columns[5 + index] = odfCell(1, sheet.columns[index]);
        return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
      },
    );
    await expect(new ODSImporter().import(workbook, plan)).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({
        sheet: sheet.sheetName, row: 4, column: columnLetter(5 + index),
        instancePath: '/peilmeting/0/hasResult/volumeWerking',
        message: expect.stringContaining('must NOT be valid'),
      })]),
    });
  });

  it('retains duration validation on the inner value and reports its physical cell', async () => {
    const index = sheet.columns.findIndex(column => column.path.join('/') === 'hasResult/duurStil/value');
    const workbook = await modifyTable(
      await new ODSGenerator().generate({ plan, data: data(), references }), sheet.sheetName, rows => {
        const columns = cells(rows[3]);
        columns[5 + index] = odfCell('eight hours');
        return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
      },
    );
    await expect(new ODSImporter().import(workbook, plan)).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({
        sheet: sheet.sheetName, row: 4, column: columnLetter(5 + index),
        instancePath: '/peilmeting/0/hasResult/duurStil/value',
        message: expect.stringContaining('format'),
      })]),
    });
  });
});
