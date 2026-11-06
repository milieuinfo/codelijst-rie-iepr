import type { CellValue, TabularColumn } from '../models/tabular-plan.js';
import type { ParentKeyComponent } from './workbook-layout.js';

function scalarKey(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw new Error('Key values must be scalar.');
  }
  if (typeof value === 'string' && !value.trim()) throw new Error('Key values cannot be empty.');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Key values must be finite.');
  return JSON.stringify([typeof value, value]);
}

export function keyPart(value: unknown, column: TabularColumn): string {
  if (!column.schema['x-inline-array']) return scalarKey(value);
  let items = value;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { throw new Error('Key arrays must contain valid JSON choices.'); }
  }
  if (!Array.isArray(items) || !items.length) throw new Error('Key arrays cannot be missing or empty.');
  const parts = items.map(scalarKey);
  if (new Set(parts).size !== parts.length) throw new Error('Key arrays cannot contain duplicate elements.');
  return JSON.stringify(parts.sort());
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
