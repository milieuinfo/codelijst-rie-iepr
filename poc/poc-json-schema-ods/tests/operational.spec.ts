import { describe, expect, it } from 'vitest';
import {
  operationalCases, operationalSource, emissionCase, normalWaterCase, abnormalWaterCase, waterSelfControlCase,
} from '../../poc-json-schema/tests/operational-fixtures.js';
import { compileTabularPlan, hash } from '../src/services/tabular-plan.js';
import { ODSGenerator } from '../src/services/ods-generator.js';
import { ODSImporter } from '../src/services/ods-importer.js';
import { odfCell, columnLetter } from '../src/services/odf.js';
import { cells, row, modifyTable } from './fixtures.js';

const sourceSha256 = hash(operationalSource);

describe('Actual operational code lists -> schema -> ODS -> JSON', () => {
  it.each(operationalCases)('round-trips $id with multiple records and local result units exactly', async testCase => {
    const plan = compileTabularPlan(testCase.schema, { sourceSha256 });
    const workbook = await new ODSGenerator().generate({ plan, data: testCase.data, references: testCase.references });
    expect(await new ODSImporter().import(workbook, plan)).toEqual(testCase.data);
  });

  it.each(operationalCases)('preserves $id requiredness when importing an untouched template', async testCase => {
    const plan = compileTabularPlan(testCase.schema, { sourceSha256 });
    const workbook = await new ODSGenerator().generate({ plan, references: testCase.references });
    if (testCase.schema.required?.length) {
      await expect(new ODSImporter().import(workbook, plan)).rejects.toMatchObject({
        diagnostics: expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('fewer than 1 items') })]),
      });
    } else {
      expect(await new ODSImporter().import(workbook, plan)).toEqual({});
    }
  });

  it('keeps air parameter row sets linked to their emission and inlines singleton Resultaat values', () => {
    const plan = compileTabularPlan(emissionCase().schema, { sourceSha256 });
    const emissions = plan.records.find(record => record.path.join('/') === 'emissie')!;
    const parameters = plan.records.find(record => record.parentId === emissions.id && record.path.join('/') === 'emissieParameter')!;
    expect(parameters.parentId).toBe(emissions.id);
    expect(parameters.columns.map(column => column.path.join('/'))).toEqual(expect.arrayContaining([
      'observedProperty', 'hasResult/numericValue', 'hasResult/additionalProperty/value',
    ]));
    expect(plan.records.some(record => record.title.includes('Resultaat'))).toBe(false);
  });

  it('keeps water self-control lab details on Meting and analysis results on linked Parameter rows', () => {
    const plan = compileTabularPlan(waterSelfControlCase().schema, { sourceSha256 });
    const measurement = plan.records.find(record => record.path.join('/') === 'meting')!;
    const parameters = plan.records.find(record => record.parentId === measurement.id && record.path.join('/') === 'hasMember')!;
    expect(parameters.parentId).toBe(measurement.id);
    expect(measurement.columns.map(column => column.path.join('/'))).toContain('madeBySensor/label');
    expect(parameters.columns.map(column => column.path.join('/'))).toContain('hasResult/parameterSoort/value');
  });

  it('does not invent optional member results or Procedures from prefilled template constants', async () => {
    const testCase = normalWaterCase();
    const plan = compileTabularPlan(testCase.schema, { sourceSha256 });
    const minimal = {
      ...testCase.data,
      lozing: testCase.data.lozing.map(record => ({
        additionalProperty: record.additionalProperty,
        lozingDebiet: record.lozingDebiet,
        lozingDagen: record.lozingDagen,
      })),
    };
    const workbook = await new ODSGenerator().generate({ plan, data: minimal, references: testCase.references });
    expect(await new ODSImporter().import(workbook, plan)).toEqual(minimal);
  });

  it('reports an invalid duration at its own abnormal-water result cell rather than the annual mass cell', async () => {
    const testCase = abnormalWaterCase();
    const plan = compileTabularPlan(testCase.schema, { sourceSha256 });
    const sheet = plan.records.find(record => record.path.join('/') === 'abnormaleLozing')!;
    const index = sheet.columns.findIndex(column => column.path.join('/') === 'hasResult/additionalProperty/value');
    expect(index).toBeGreaterThanOrEqual(0);
    const workbook = await modifyTable(
      await new ODSGenerator().generate({ plan, data: testCase.data, references: testCase.references }),
      sheet.sheetName, rows => {
        const columns = cells(rows[3]);
        columns[5 + index] = odfCell('not a duration count');
        return [...rows.slice(0, 3), row(columns), ...rows.slice(4)];
      },
    );
    await expect(new ODSImporter().import(workbook, plan)).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({
        sheet: sheet.sheetName, row: 4, column: columnLetter(5 + index),
        message: expect.stringContaining('number'),
      })]),
    });
  });
});
