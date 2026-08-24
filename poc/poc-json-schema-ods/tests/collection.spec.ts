import { describe, it, expect } from 'vitest';
import { SchemaFlattener } from '../src/services/schema-flattener.js';
import { SheetSplitter } from '../src/services/sheet-splitter.js';

/**
 * WP2: a sosa:ObservationCollection composite must flow through the ODS
 * pipeline as a collection envelope — collection-level fields on the main
 * sheet, individual observaties on a separate "Observaties" sheet
 * (one row per member, via sosa:hasMember).
 */
describe('Collection envelope (sosa:ObservationCollection) ODS mapping', () => {
  const collectionSchema = {
    type: 'object',
    'x-jsonld-type': 'http://www.w3.org/ns/sosa/ObservationCollection',
    required: ['hasFeatureOfInterest', 'hasMember'],
    properties: {
      created: { type: 'string', format: 'date-time', title: 'Gemaakt op' },
      observedProperty: {
        type: 'string',
        title: 'Geobserveerde eigenschap',
        allOf: [{ enum: ['https://x/a', 'https://x/b'] }],
      },
      wasOriginatedBy: { type: 'string', title: 'Oorzaak emissie' },
      hasMember: {
        type: 'array',
        minItems: 1,
        title: 'Observaties',
        items: {
          type: 'object',
          required: ['hasResult'],
          properties: {
            observedProperty: { type: 'string', title: 'Lid grootheid' },
            hasResult: {
              type: 'object',
              required: ['numericValue', 'hasUnit'],
              properties: {
                numericValue: { type: 'number', title: 'Numerieke waarde' },
                hasUnit: { type: 'string', title: 'Eenheid' },
              },
            },
            afvalproductAard: { type: 'string', title: 'Aard' },
          },
        },
      },
    },
  };

  it('flattens collection-level fields to the main sheet and members under hasMember', () => {
    const flattener = new SchemaFlattener();
    const cols = flattener.flatten(collectionSchema);
    const byPath = new Map(cols.map((c) => [c.jsonPath, c]));

    // Collection-level fields stay on the main sheet (no parent array)
    expect(byPath.get('/created')?.parentArray).toBeUndefined();
    expect(byPath.get('/observedProperty')?.parentArray).toBeUndefined();
    expect(byPath.get('/wasOriginatedBy')?.parentArray).toBeUndefined();

    // Member fields are routed under the hasMember array
    expect(byPath.get('/hasMember/observedProperty')?.parentArray).toBe('/hasMember');
    expect(byPath.get('/hasMember/hasResult/numericValue')?.parentArray).toBe('/hasMember');
    expect(byPath.get('/hasMember/afvalproductAard')?.parentArray).toBe('/hasMember');

    // Member required: hasResult children required, hoisted fields optional
    expect(byPath.get('/hasMember/hasResult/numericValue')?.required).toBe(true);
    expect(byPath.get('/hasMember/hasResult/hasUnit')?.required).toBe(true);
    expect(byPath.get('/hasMember/afvalproductAard')?.required).toBe(false);

    // The array's Dutch title is carried through for the nested sheet name
    expect(byPath.get('/hasMember/observedProperty')?.arrayTitle).toBe('Observaties');
  });

  it('splits the collection into a main sheet plus an "Observaties" member sheet', () => {
    const flattener = new SchemaFlattener();
    const cols = flattener.flatten(collectionSchema);
    const sheets = new SheetSplitter().split(cols, 'Afvalproduct');

    expect(sheets).toHaveLength(2);

    const mainSheet = sheets[0];
    expect(mainSheet.sheetName).toBe('Afvalproduct');
    expect(mainSheet.columns.map((c) => c.jsonPath)).toEqual(
      expect.arrayContaining(['/created', '/observedProperty', '/wasOriginatedBy']),
    );
    expect(mainSheet.columns.map((c) => c.jsonPath)).not.toContain('/hasMember/observedProperty');

    const memberSheet = sheets[1];
    expect(memberSheet.sheetName).toBe('Observaties');
    expect(memberSheet.parentPath).toBe('/hasMember');
    expect(memberSheet.columns.map((c) => c.jsonPath)).toEqual(
      expect.arrayContaining([
        '/hasMember/observedProperty',
        '/hasMember/hasResult/numericValue',
        '/hasMember/hasResult/hasUnit',
        '/hasMember/afvalproductAard',
      ]),
    );
  });
});
