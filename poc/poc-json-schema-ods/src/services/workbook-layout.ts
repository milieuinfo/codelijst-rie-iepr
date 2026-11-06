import type { RecordPlan, TabularColumn, TabularPlan } from '../models/tabular-plan.js';

export const technicalColumns = ['_row_id', '_parent_id', '_containers', '_ref', '_parent_ref'];
const identifiers = ['http://purl.org/dc/terms/identifier', 'https://schema.org/identifier', 'http://schema.org/identifier'];

export interface ParentKeyComponent {
  sourceConcept: string;
  column: TabularColumn;
  id: string;
}

export function businessLayout(plan: TabularPlan): boolean {
  return typeof plan.schema['x-table-workbook'] === 'string';
}

export function inputColumns(record: RecordPlan): TabularColumn[] {
  return record.columns.filter(column => !column.schema['x-ui-hidden'] &&
    column.path.at(-1) !== '@id' &&
    !(column.schema.const !== undefined && ['observedProperty', 'propertyID'].includes(column.path.at(-1) ?? '')));
}

export function quantityValueColumn(record: RecordPlan, unit: TabularColumn): TabularColumn | undefined {
  if (unit.path.at(-1) !== 'hasUnit') return undefined;
  return record.columns.find(column => column.path.length === unit.path.length &&
    column.path.at(-1) === 'numericValue' &&
    unit.path.slice(0, -1).every((part, index) => column.path[index] === part));
}

export function identifierColumn(record: RecordPlan): TabularColumn | undefined {
  return record.columns.find(column => column.path.length === 1 && identifiers.includes(String(column.schema['x-jsonld-id'])));
}

export function parentKeyComponents(plan: TabularPlan, record: RecordPlan): ParentKeyComponent[] {
  const parent = plan.records.find(candidate => candidate.id === record.parentId);
  if (!parent || parent.id === 'root' || parent.schema['x-table-key'] === undefined) return [];
  const declared = parent.schema['x-table-key'];
  if (!Array.isArray(declared) || declared.length === 0 ||
      !declared.every(value => typeof value === 'string' && value.trim().length > 0) ||
      new Set(declared).size !== declared.length) {
    throw new Error(`${parent.sheetName}: x-table-key must be a non-empty array of unique source concept URIs.`);
  }
  return declared.map(sourceConcept => {
    const matches = inputColumns(parent).filter(column => column.schema['x-source-concept'] === sourceConcept);
    if (matches.length !== 1) {
      throw new Error(`${parent.sheetName}: x-table-key component ${sourceConcept} must resolve to exactly one visible input column.`);
    }
    const column = matches[0];
    const type = column.schema['x-inline-array'] ? column.schema.items && (column.schema.items as { type?: string }).type : column.schema.type;
    let node = parent.schema;
    let quantity = false;
    for (const token of column.path.slice(0, -1)) {
      const properties = node.properties;
      if (properties?.numericValue !== undefined && properties.hasUnit !== undefined) quantity = true;
      const next = properties?.[token];
      if (!next || typeof next !== 'object' || Array.isArray(next)) break;
      node = next as typeof node;
    }
    if (node.properties?.numericValue !== undefined && node.properties.hasUnit !== undefined) quantity = true;
    if (!['string', 'number', 'integer', 'boolean'].includes(String(type)) ||
        column.schema['x-value-path'] !== undefined ||
        quantity || (column.schema['x-inline-array'] &&
          ((column.schema.items as { items?: unknown; properties?: unknown })?.items !== undefined ||
           (column.schema.items as { items?: unknown; properties?: unknown })?.properties !== undefined))) {
      throw new Error(`${parent.sheetName}: x-table-key component ${sourceConcept} must be a scalar or scalar inline array.`);
    }
    return { sourceConcept, column, id: `_key_${column.id}` };
  });
}

export function keyComponentsForParent(plan: TabularPlan, parent: RecordPlan): ParentKeyComponent[] {
  const child = plan.records.find(candidate => candidate.parentId === parent.id);
  return child ? parentKeyComponents(plan, child) : [];
}

export function parentColumn(plan: TabularPlan, record: RecordPlan): boolean {
  return !!record.parentId && record.parentId !== 'root' && parentKeyComponents(plan, record).length === 0;
}

export function layoutColumns(plan: TabularPlan, record: RecordPlan): string[] {
  const keyColumns = parentKeyComponents(plan, record).map(component => component.id);
  return businessLayout(plan)
    ? [...keyColumns, ...(parentColumn(plan, record) ? ['_parent_ref'] : []), ...inputColumns(record).map(column => column.id)]
    : [...technicalColumns, ...keyColumns, ...record.columns.map(column => column.id)];
}

export function parentTitle(plan: TabularPlan, record: RecordPlan): string {
  const parent = plan.records.find(candidate => candidate.id === record.parentId);
  const title = parent && identifierColumn(parent)?.title;
  return title?.replace(/nummer$/i, '') || parent?.title || 'Record';
}
