import type { CellValue, TabularColumn } from '../models/tabular-plan.js';
import type { ParentKeyComponent } from './workbook-layout.js';
import { canonicalKeyPart } from 'codelijst-rie-iepr-poc-json-schema/browser';

export function keyPart(value: unknown, column: TabularColumn): string {
  if (!column.schema['x-inline-array']) return canonicalKeyPart(value);
  let items = value;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { throw new Error('Key arrays must contain valid JSON choices.'); }
  }
  return canonicalKeyPart(items, true);
}

export function keyIdentity(values: unknown[], components: ParentKeyComponent[]): string {
  if (values.length !== components.length) throw new Error('Key component count does not match the declaration.');
  return JSON.stringify(values.map((value, index) => keyPart(value, components[index].column)));
}

export function encodedKeyValues(
  values: Record<string, CellValue>, components: ParentKeyComponent[],
): unknown[] {
  return components.map(({ column }) => {
    const value = values[column.id];
    if (value === undefined) return undefined;
    return column.schema['x-inline-array'] ? JSON.parse(String(value)) : value;
  });
}
