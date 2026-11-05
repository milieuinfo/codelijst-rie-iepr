import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { JsonSchemaObject } from 'codelijst-rie-iepr-poc-json-schema';
import {
  operationalCases, operationalSource, reportingSection,
} from '../../poc-json-schema/tests/operational-fixtures.js';
import { compileTabularPlan, hash, pointer } from '../src/services/tabular-plan.js';

interface GeneratedMapping {
  schemaEntry?: string;
  record: string;
  columnPointer: string;
  schemaPointer: string;
}

const inventory: {
  workbooks: { file: string; sheets: { name: string; columns: { label: string; generated?: GeneratedMapping }[] }[] }[];
} = JSON.parse(readFileSync(new URL('../docs/teepak-mapping.json', import.meta.url), 'utf8'));
const mappings = inventory.workbooks.flatMap(workbook => workbook.sheets.flatMap(sheet =>
  sheet.columns.flatMap(column => column.generated
    ? [{ file: workbook.file, sheet: sheet.name, label: column.label, generated: column.generated }] : []),
));
const schemas = [
  ...operationalCases.map(testCase => testCase.schema),
  ...['kwaliteitsmeting', 'onttrekking', 'peilmeting'].map(id => reportingSection('Grondwater', `grondwater:${id}`)),
].map(schema => ({ schema, plan: compileTabularPlan(schema, { sourceSha256: hash(operationalSource) }) }));

function resolve(schema: JsonSchemaObject, pointer: string): unknown {
  let node: unknown = schema;
  for (const token of pointer.slice(1).split('/')) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!node || typeof node !== 'object' || !(key in node)) throw new Error(`Unresolved inventory pointer: ${pointer}`);
    node = Reflect.get(node, key);
  }
  return node;
}

describe('Source-review inventory agrees with actual schemas and ODS columns', () => {
  it('retains all fourteen reference workbooks and mappings for every working section', () => {
    expect(inventory.workbooks).toHaveLength(14);
    expect(mappings).toHaveLength(67);
    for (const testCase of operationalCases) {
      expect(mappings.some(mapping => mapping.generated.schemaEntry &&
        testCase.schema.$id!.endsWith('/' + mapping.generated.schemaEntry))).toBe(true);
    }
  });

  it.each(mappings)('$file / $sheet / $label has an exact schema and record-local column pointer', ({ generated }) => {
    const candidates = schemas.filter(({ schema }) => !generated.schemaEntry || schema.$id!.endsWith('/' + generated.schemaEntry));
    const matches = candidates.flatMap(({ schema, plan }) => plan.records.flatMap(record =>
      record.columns.filter(column =>
        record.sheetName === generated.record &&
        pointer(column.path) === generated.columnPointer &&
        column.schemaPointer === generated.schemaPointer,
      ).map(column => ({ schema, column })),
    ));
    expect(matches).toHaveLength(1);
    expect(resolve(matches[0].schema, generated.schemaPointer)).toBeDefined();
  });
});
