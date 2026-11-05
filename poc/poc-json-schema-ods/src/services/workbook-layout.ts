import type { RecordPlan, TabularColumn, TabularPlan } from '../models/tabular-plan.js';

export const technicalColumns = ['_row_id', '_parent_id', '_containers', '_ref', '_parent_ref'];
const identifiers = ['http://purl.org/dc/terms/identifier', 'https://schema.org/identifier', 'http://schema.org/identifier'];

export function businessLayout(plan: TabularPlan): boolean {
  return typeof plan.schema['x-table-workbook'] === 'string';
}

export function inputColumns(record: RecordPlan): TabularColumn[] {
  return record.columns.filter(column => !column.schema['x-ui-hidden'] &&
    column.path.at(-1) !== '@id' &&
    !(column.schema.const !== undefined && ['observedProperty', 'propertyID'].includes(column.path.at(-1) ?? '')));
}

export function identifierColumn(record: RecordPlan): TabularColumn | undefined {
  return record.columns.find(column => column.path.length === 1 && identifiers.includes(String(column.schema['x-jsonld-id'])));
}

export function parentColumn(plan: TabularPlan, record: RecordPlan): boolean {
  return !!record.parentId && record.parentId !== 'root';
}

export function layoutColumns(plan: TabularPlan, record: RecordPlan): string[] {
  return businessLayout(plan)
    ? [...(parentColumn(plan, record) ? ['_parent_ref'] : []), ...inputColumns(record).map(column => column.id)]
    : [...technicalColumns, ...record.columns.map(column => column.id)];
}

export function parentTitle(plan: TabularPlan, record: RecordPlan): string {
  const parent = plan.records.find(candidate => candidate.id === record.parentId);
  const title = parent && identifierColumn(parent)?.title;
  return title?.replace(/nummer$/i, '') || parent?.title || 'Record';
}
