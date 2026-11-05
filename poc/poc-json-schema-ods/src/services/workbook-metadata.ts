import { SchemaValidator } from 'codelijst-rie-iepr-poc-json-schema';
import type { JsonSchemaObject, ReferenceRecord, ReferenceContext } from 'codelijst-rie-iepr-poc-json-schema';
import type { WorkbookMetadata } from '../models/tabular-plan.js';

const string: JsonSchemaObject = { type: 'string' };
const strings: JsonSchemaObject = { type: 'array', items: string };
const reference: JsonSchemaObject = {
  type: 'object', additionalProperties: false, required: ['id', 'label', 'types'],
  properties: {
    id: { type: 'string', minLength: 1 }, label: { type: 'string', minLength: 1 },
    types: { type: 'array', minItems: 1, items: string }, parents: strings, year: { type: 'integer' },
  },
};
const referencesSchema: JsonSchemaObject = { type: 'array', items: reference };
const contextSchema: JsonSchemaObject = {
  type: 'object', additionalProperties: false,
  properties: { year: { type: 'integer' }, ids: strings },
};
const row: JsonSchemaObject = {
  type: 'object', additionalProperties: false, required: ['recordId', 'reference'],
  properties: { recordId: string, parentId: string, reference: string, parentReference: string },
};
const choice: JsonSchemaObject = {
  type: 'object', additionalProperties: false, required: ['value', 'display'],
  properties: { value: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] }, display: string },
};
const metadataSchema: JsonSchemaObject = {
  type: 'object', additionalProperties: false,
  required: ['version', 'schemaId', 'schemaSha256', 'sourceSha256', 'planSha256', 'lookups', 'rows', 'references'],
  properties: {
    version: { const: 1 }, schemaId: string,
    schemaSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    sourceSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    planSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    lookups: { type: 'object', additionalProperties: false, patternProperties: { '^c_[0-9a-f]{24}$': { type: 'array', items: choice } } },
    rows: { type: 'object', additionalProperties: false, patternProperties: { '^[0-9a-f-]{36}$': row } },
    references: referencesSchema,
    referenceContext: contextSchema,
    layout: { const: 'business-v1' },
    businessRows: {
      type: 'object', additionalProperties: false,
      patternProperties: {
        '^[0-9a-f-]{36}$': {
          type: 'object', additionalProperties: false, required: ['values', 'containers'],
          properties: {
            values: { type: 'object', additionalProperties: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] } },
            containers: {
              type: 'array', items: {
                type: 'object', additionalProperties: false, required: ['path', 'kind', 'required'],
                properties: { path: strings, kind: { enum: ['object', 'array'] }, required: { type: 'boolean' } },
              },
            },
          },
        },
      },
    },
  },
};

function assertValid(schema: JsonSchemaObject, value: unknown, description: string): void {
  const result = new SchemaValidator().validateInstance(schema, value);
  if (!result.valid) throw new Error(`${description}: ${result.errors.map(error => `${error.instancePath} ${error.message}`).join('; ')}`);
}

export function referenceContext(value: unknown): ReferenceContext {
  assertValid(contextSchema, value, 'Invalid reference context');
  return value as ReferenceContext;
}

export function referenceData(value: unknown): ReferenceRecord[] {
  assertValid(referencesSchema, value, 'Invalid reference data');
  const references = value as ReferenceRecord[];
  if (new Set(references.map(reference => reference.id)).size !== references.length) throw new Error('Duplicate reference-data identities.');
  return references;
}

export function workbookMetadata(value: unknown): WorkbookMetadata {
  assertValid(metadataSchema, value, 'Missing or incompatible workbook metadata');
  const metadata = value as WorkbookMetadata;
  referenceData(metadata.references);
  return metadata;
}
