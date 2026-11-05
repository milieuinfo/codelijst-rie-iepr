import type { RecordJsonMapping, TabularPlan } from '../models/tabular-plan.js';
import { pointer } from './tabular-plan.js';
import { identifierColumn, layoutColumns } from './workbook-layout.js';

export function jsonMapping(plan: TabularPlan): Record<string, RecordJsonMapping> {
  const mappings: Record<string, RecordJsonMapping> = {};
  for (const record of plan.records) {
    const parent = record.parentId ? plan.records.find(candidate => candidate.id === record.parentId) : undefined;
    const parentPath = parent ? mappings[parent.id].pathTemplate : undefined;
    const pathTemplate = parentPath === undefined ? '' : `${parentPath}${pointer(record.path)}/*`;
    const identifier = parent && identifierColumn(parent);
    mappings[record.id] = {
      pathTemplate,
      ...(parentPath === undefined ? {} : { parentPathTemplate: parentPath }),
      ...(identifier ? { parentIdentifierPath: `${parentPath}${pointer(identifier.path)}` } : {}),
      columns: Object.fromEntries(record.columns.map(column => [column.id, pointer(column.path)])),
    };
  }
  return mappings;
}

export function machineColumns(plan: TabularPlan, recordId: string): string[] {
  const record = plan.records.find(record => record.id === recordId)!;
  const mapping = jsonMapping(plan)[recordId];
  return layoutColumns(plan, record).map(id =>
    id === '_parent_ref' && mapping.parentIdentifierPath ? mapping.parentIdentifierPath : mapping.columns[id] ?? id);
}
