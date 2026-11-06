import type { RecordJsonMapping, TabularPlan } from '../models/tabular-plan.js';
import { pointer } from './tabular-plan.js';
import { identifierColumn, layoutColumns, parentKeyComponents } from './workbook-layout.js';
import { canonicalColumnPath, canonicalRecordPath } from 'codelijst-rie-iepr-poc-json-schema/browser';
import { schemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser';
import type { JsonSchemaObject } from 'codelijst-rie-iepr-poc-json-schema/browser';

function canonicalRecordSchema(plan: TabularPlan, recordId: string): JsonSchemaObject {
  const record = plan.records.find(record => record.id === recordId)!;
  if (recordId === 'root') return plan.schema;
  const source = record.schema['x-source-concept'];
  const find = (node: JsonSchemaObject): JsonSchemaObject | undefined => {
    if (source && node['x-source-concept'] === source && node.type === record.schema.type) return node;
    const children = [...Object.values(node.properties ?? {}).map(schemaObject),
      ...(node.items ? [schemaObject(node.items)] : []),
      ...(Array.isArray(node.oneOf) ? node.oneOf.map(schemaObject) : [])];
    for (const child of children) {
      const match = find(child);
      if (match) return match;
    }
  };
  return find(plan.schema) ?? record.schema;
}

export function jsonMapping(plan: TabularPlan): Record<string, RecordJsonMapping> {
  const mappings: Record<string, RecordJsonMapping> = {};
  for (const record of plan.records) {
    const schema = canonicalRecordSchema(plan, record.id);
    const parent = record.parentId ? plan.records.find(candidate => candidate.id === record.parentId) : undefined;
    const parentPath = parent ? mappings[parent.id].pathTemplate : undefined;
    const pathTemplate = parentPath === undefined ? '' :
      `${parentPath}${pointer(canonicalRecordPath(canonicalRecordSchema(plan, parent!.id), record.path))}/*`;
    const identifier = parent && identifierColumn(parent);
    const keyComponents = parent ? parentKeyComponents(plan, record) : [];
    mappings[record.id] = {
      pathTemplate,
      ...(parentPath === undefined ? {} : { parentPathTemplate: parentPath }),
      ...(identifier && !keyComponents.length ? { parentIdentifierPath: `${parentPath}${pointer(identifier.path)}` } : {}),
      ...(keyComponents.length ? {
        parentKeyPaths: Object.fromEntries(keyComponents.map(component => [
          component.sourceConcept, pointer(component.column.path),
        ])),
      } : {}),
      columns: Object.fromEntries(record.columns.map(column => {
        const path = canonicalColumnPath(schema, column.path);
        return [column.id, path.includes('[?(') ? path : pointer(column.path)];
      })),
    };
  }
  return mappings;
}

export function machineColumns(plan: TabularPlan, recordId: string): string[] {
  const record = plan.records.find(record => record.id === recordId)!;
  const mapping = jsonMapping(plan)[recordId];
  const keyPaths = Object.fromEntries(parentKeyComponents(plan, record).map(component =>
    [component.id, `@parent-key:${component.sourceConcept}`]));
  return layoutColumns(plan, record).map(id =>
    keyPaths[id] ?? (id === '_parent_ref' && mapping.parentIdentifierPath ? mapping.parentIdentifierPath : mapping.columns[id] ?? id));
}
