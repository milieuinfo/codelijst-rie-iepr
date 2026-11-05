import { describe, expect, it } from 'vitest';
import { array, object, plan, reportingSchema, text } from './fixtures.js';

describe('Recursive schema-to-tabular plan', () => {
  it('retains all record ancestry and separates scalar arrays without a cross product', () => {
    const result = plan(reportingSchema);
    expect(result.records.map(record => record.title)).toEqual([
      'Synthetische rapportage', 'Records', 'Keuzen', 'Kinderen', 'Kleinkinderen', 'Onafhankelijke notities',
    ]);
    const records = result.records.find(record => record.title === 'Records')!;
    const children = result.records.find(record => record.title === 'Kinderen')!;
    const grandchildren = result.records.find(record => record.title === 'Kleinkinderen')!;
    const siblings = result.records.find(record => record.title === 'Onafhankelijke notities')!;
    expect(grandchildren.ancestry).toEqual(['root', records.id, children.id]);
    expect(siblings.parentId).toBe(records.id);
    expect(records.columns.some(column => column.path[0] === 'children')).toBe(false);
    expect(records.columns.find(column => column.path.join('/') === 'quantity/numericValue')?.title).toBe('Meetwaarde');
    expect(result.records.find(record => record.title === 'Keuzen')!.kind).toBe('value');
    expect(result.records.find(record => record.title === 'Keuzen')!.columns[0].path).toEqual([]);
  });

  it('uses exact escaped schema pointers, separate record-local paths and stable machine IDs', () => {
    const schema = object({ 'a/b~c': array(object({ 'x/y~z': text }), 'Een') });
    const first = plan(schema);
    const second = plan({ ...schema, title: 'Other translated title' });
    const column = first.records[1].columns[0];
    expect(column.schemaPointer).toBe('/properties/a~1b~0c/items/properties/x~1y~0z');
    expect(column.path).toEqual(['x/y~z']);
    expect(second.records[1].id).toBe(first.records[1].id);
    expect(second.records[1].columns[0].id).toBe(column.id);
  });

  it('resolves explicit local references while retaining their actual definition pointers', () => {
    const result = plan(object({ values: array({ $ref: '#/$defs/item' }) }, {
      $defs: { item: object({ value: text }) },
    }));
    expect(result.records[1].columns[0].schemaPointer).toBe('/$defs/item/properties/value');
  });

  it('preserves empty object records and arrays of arrays', () => {
    const result = plan(object({ empty: array(object({})), nested: array(array(text)) }));
    expect(result.records).toHaveLength(4);
    expect(result.records[1].columns).toEqual([]);
    expect(result.records[2].kind).toBe('array');
    expect(result.records[3].kind).toBe('value');
    expect(result.records[3].path).toEqual([]);
  });

  it('does not turn conditional or optional-object requirements into unconditional column flags', () => {
    const record = plan(reportingSchema).records[1];
    expect(record.columns.find(column => column.path[0] === 'identifier')!.required).toBe(true);
    expect(record.columns.find(column => column.path[0] === 'conditional')!.required).toBe(false);
    expect(record.columns.find(column => column.path.join('/') === 'period/start')!.required).toBe(false);
  });

  it.each([
    object({ open: { type: 'object' } }),
    object({ mixed: { oneOf: [text, { type: 'number' }] } }),
    object({ values: array({ $ref: 'https://example.test/missing' }) }),
    object({ values: array({ $ref: '#/$defs/recursive' }) }, {
      $defs: { recursive: object({ children: array({ $ref: '#/$defs/recursive' }) }) },
    }),
  ])('rejects unsupported, unresolved and recursively unbounded structures explicitly', schema => {
    expect(() => plan(schema)).toThrow();
  });
});
