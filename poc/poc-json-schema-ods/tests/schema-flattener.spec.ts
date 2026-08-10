import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SchemaFlattener } from '../src/services/schema-flattener.js';

describe('SchemaFlattener', () => {
  it('reads x-ui-first and x-ui-after from property schemas', () => {
    const flattener = new SchemaFlattener();
    const schema = {
      type: 'object',
      properties: {
        eerst: {
          type: 'string',
          'x-ui-first': true,
        },
        tweede: {
          type: 'string',
          'x-ui-after': 'eerst',
        },
        vrij: {
          type: 'string',
        },
      },
    };

    const cols = flattener.flatten(schema);
    const byPath = new Map(cols.map(c => [c.jsonPath, c]));

    expect(byPath.get('/eerst')?.xUiFirst).toBe(true);
    expect(byPath.get('/tweede')?.xUiAfter).toBe('eerst');
    expect(byPath.get('/vrij')?.xUiFirst).toBe(false);
  });

  it('flattens ui-ordered sub-schema style input into sorted columns', () => {
    const flattener = new SchemaFlattener();
    const schema = {
      type: 'object',
      properties: {
        derde: {
          type: 'string',
          'x-ui-after': 'tweede',
        },
        tweede: {
          type: 'string',
          'x-ui-after': 'eerst',
        },
        eerst: {
          type: 'string',
          'x-ui-first': true,
        },
        vrij: {
          type: 'number',
        },
      },
    };

    const cols = flattener.flatten(schema);
    expect(cols.map(c => c.jsonPath)).toEqual(['/eerst', '/tweede', '/derde', '/vrij']);
  });

  it('resolves x-ui-first/x-ui-after from the base schema through a $ref', () => {
    const flattener = new SchemaFlattener();
    const basePath = join(tmpdir(), 'ui-ordering-base-schema.json');
    writeFileSync(basePath, JSON.stringify({
      type: 'object',
      properties: {
        resultTime: {
          type: 'string',
          'x-ui-first': true,
        },
      },
    }));
    flattener.loadBaseSchema(basePath);

    const schema = {
      type: 'object',
      properties: {
        resultTime: {
          $ref: '#/properties/resultTime',
        },
      },
    };

    const cols = flattener.flatten(schema);
    expect(cols.find(c => c.jsonPath === '/resultTime')?.xUiFirst).toBe(true);
  });

  describe('nested object flattening and conditional properties', () => {
    it('$ref-wrapped nested object flattens to child columns without a parent leaf', () => {
      const flattener = new SchemaFlattener();
      const basePath = join(tmpdir(), 'nested-object-base-schema.json');
      writeFileSync(basePath, JSON.stringify({
        type: 'object',
        properties: {
          hasResult: {
            type: 'object',
            title: 'Resultaat',
            required: ['numericValue', 'hasUnit'],
            properties: {
              numericValue: {
                type: 'number',
                title: 'Numerieke waarde',
              },
              hasUnit: {
                type: 'string',
                title: 'Eenheid',
              },
            },
          },
        },
      }));
      flattener.loadBaseSchema(basePath);

      const schema = {
        type: 'object',
        properties: {
          hasResult: {
            allOf: [{ $ref: '#/properties/hasResult' }],
          },
        },
      };

      const cols = flattener.flatten(schema);
      const byPath = new Map(cols.map(c => [c.jsonPath, c]));

      expect(byPath.has('/hasResult')).toBe(false);
      expect(byPath.get('/hasResult/numericValue')?.title).toBe('Numerieke waarde');
      expect(byPath.get('/hasResult/numericValue')?.uiType).toBe('number');
      expect(byPath.get('/hasResult/numericValue')?.required).toBe(true);
      expect(byPath.get('/hasResult/hasUnit')?.title).toBe('Eenheid');
      expect(byPath.get('/hasResult/hasUnit')?.uiType).toBe('text');
      expect(byPath.get('/hasResult/hasUnit')?.required).toBe(true);
    });

    it('conditional if/then object does not create a parent leaf column', () => {
      const flattener = new SchemaFlattener();
      const schema = {
        type: 'object',
        allOf: [
          {
            if: {
              properties: { observedProperty: { const: 'x' } },
            },
            then: {
              properties: {
                hasResult: {
                  type: 'object',
                  properties: {
                    numericValue: { type: 'number' },
                  },
                },
              },
            },
          },
        ],
      };

      const cols = flattener.flatten(schema);
      const byPath = new Map(cols.map(c => [c.jsonPath, c]));

      expect(byPath.has('/hasResult')).toBe(false);
      expect(byPath.has('/hasResult/numericValue')).toBe(true);
      expect(byPath.get('/hasResult/numericValue')?.uiType).toBe('number');
    });

    it('array items get parentArray, object members do not', () => {
      const flattener = new SchemaFlattener();
      const schema = {
        type: 'object',
        properties: {
          onttrekking: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                volume: { type: 'number' },
              },
            },
          },
          hasResult: {
            type: 'object',
            required: ['numericValue'],
            properties: {
              numericValue: { type: 'number' },
            },
          },
        },
      };

      const cols = flattener.flatten(schema);
      const byPath = new Map(cols.map(c => [c.jsonPath, c]));

      const volumeCol = byPath.get('/onttrekking/volume');
      expect(volumeCol?.parentArray).toBe('/onttrekking');

      const nvCol = byPath.get('/hasResult/numericValue');
      expect(nvCol?.parentArray).toBe(undefined);
    });
  });

  describe('conditional required from if/then blocks (bestemmingsidentificatie pattern)', () => {
    it('marks leaf columns as required when then.properties.<key> carries a required array', () => {
      const flattener = new SchemaFlattener();
      const schema = {
        type: 'object',
        properties: {
          type: { type: 'string', title: 'Type' },
          bestemmingsidentificatie: {
            type: 'object',
            properties: {
              naam: { type: 'string', title: 'Naam' },
              ondernemingsnummer: { type: 'string', title: 'Ondernemingsnummer' },
              vestigingsnummer: { type: 'string', title: 'Vestigingsnummer' },
              btwNummer: { type: 'string', title: 'BTW-nummer' },
              adres: { type: 'string', title: 'Adres' },
            },
          },
        },
        allOf: [
          {
            if: { properties: { type: { const: 'belgisch' } } },
            then: {
              properties: {
                bestemmingsidentificatie: {
                  required: ['ondernemingsnummer', 'vestigingsnummer'],
                },
              },
            },
          },
          {
            if: { properties: { type: { const: 'buitenlands' } } },
            then: {
              properties: {
                bestemmingsidentificatie: {
                  required: ['btwNummer'],
                },
              },
            },
          },
          {
            if: { properties: { type: { const: 'geen_onderneming' } } },
            then: {
              properties: {
                bestemmingsidentificatie: {
                  required: ['adres'],
                },
              },
            },
          },
        ],
      };

      const cols = flattener.flatten(schema);
      const byPath = new Map(cols.map(c => [c.jsonPath, c]));

      expect(byPath.get('/bestemmingsidentificatie/naam')?.required).toBe(false);
      expect(byPath.get('/bestemmingsidentificatie/ondernemingsnummer')?.required).toBe(true);
      expect(byPath.get('/bestemmingsidentificatie/vestigingsnummer')?.required).toBe(true);
      expect(byPath.get('/bestemmingsidentificatie/btwNummer')?.required).toBe(true);
      expect(byPath.get('/bestemmingsidentificatie/adres')?.required).toBe(true);
      expect(byPath.get('/bestemmingsidentificatie/ondernemingsnummer')?.uiType).toBe('text');
    });

    it('does not emit the composite itself as a column — only its flattened children', () => {
      const flattener = new SchemaFlattener();
      const schema = {
        type: 'object',
        properties: {
          type: { type: 'string', title: 'Type' },
          bestemmingsidentificatie: {
            type: 'object',
            properties: {
              naam: { type: 'string', title: 'Naam' },
              ondernemingsnummer: { type: 'string', title: 'Ondernemingsnummer' },
            },
          },
        },
        allOf: [
          {
            // Visibility marker: then.properties.<key> is an empty object — must not create a column.
            if: { properties: { type: { const: 'belgisch' } } },
            then: { properties: { bestemmingsidentificatie: {} } },
          },
        ],
      };

      const cols = flattener.flatten(schema);
      const paths = cols.map(c => c.jsonPath);

      expect(paths).toContain('/bestemmingsidentificatie/naam');
      expect(paths).toContain('/bestemmingsidentificatie/ondernemingsnummer');
      expect(paths).not.toContain('/bestemmingsidentificatie');
    });

    it('creates columns from conditional required when nested properties block is absent', () => {
      const flattener = new SchemaFlattener();
      const schema = {
        type: 'object',
        properties: {
          category: { type: 'string' },
        },
        allOf: [
          {
            if: { properties: { category: { const: 'A' } } },
            then: {
              properties: {
                extraGroup: {
                  required: ['fieldX', 'fieldY'],
                },
              },
            },
          },
        ],
      };

      const cols = flattener.flatten(schema);
      const byPath = new Map(cols.map(c => [c.jsonPath, c]));

      expect(byPath.get('/extraGroup/fieldX')?.required).toBe(true);
      expect(byPath.get('/extraGroup/fieldY')?.required).toBe(true);
      expect(byPath.get('/extraGroup/fieldX')?.title).toBe('fieldX');
      expect(byPath.get('/extraGroup/fieldX')?.uiType).toBe('text');
    });

    it('skips if/then blocks whose then only constrains envelope internals without children', () => {
      const flattener = new SchemaFlattener();
      const schema = {
        type: 'object',
        properties: {
          observedProperty: { type: 'string' },
          resultTime: { type: 'string' },
        },
        allOf: [
          {
            if: { properties: { observedProperty: { const: 'temperature' } } },
            then: {
              properties: {
                hasResult: { required: ['numericValue'] },
                wasOriginatedBy: { required: ['processId'] },
              },
            },
          },
        ],
      };

      const cols = flattener.flatten(schema);
      const byPath = new Map(cols.map(c => [c.jsonPath, c]));

      // No nested properties block — pure constraint markers on envelope internals → skipped entirely
      expect(byPath.has('/hasResult')).toBe(false);
      expect(byPath.has('/hasResult/numericValue')).toBe(false);
      expect(byPath.has('/wasOriginatedBy')).toBe(false);
      expect(byPath.has('/wasOriginatedBy/processId')).toBe(false);
    });

    it('does not skip blocks that mix envelope internals with other keys', () => {
      const flattener = new SchemaFlattener();
      const schema = {
        type: 'object',
        properties: {
          category: { type: 'string' },
          hasResult: { type: 'string' },
        },
        allOf: [
          {
            if: { properties: { category: { const: 'A' } } },
            then: {
              properties: {
                hasResult: { required: ['subField'] },
                extraData: { required: ['fieldZ'] },
              },
            },
          },
        ],
      };

      const cols = flattener.flatten(schema);
      const byPath = new Map(cols.map(c => [c.jsonPath, c]));

      // extraData should be processed (block is NOT skipped because extraData is not an envelope internal)
      expect(byPath.get('/extraData/fieldZ')?.required).toBe(true);
    });
  });
});
