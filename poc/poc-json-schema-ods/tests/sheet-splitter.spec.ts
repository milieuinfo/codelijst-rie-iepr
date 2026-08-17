import { describe, it, expect } from 'vitest';
import { SheetSplitter } from '../src/services/sheet-splitter.js';
import type { ColumnDefinition } from '../src/models/column.js';

function col(path: string, opts: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    jsonPath: path,
    title: path,
    uiType: 'text',
    required: false,
    ...opts,
  };
}

describe('SheetSplitter', () => {
  it('object-member nested columns stay in the main sheet', () => {
    const splitter = new SheetSplitter();
    const columns = [
      col('/observedProperty'),
      col('/hasResult/numericValue'),
      col('/hasResult/hasUnit'),
    ];

    const sheets = splitter.split(columns, 'Lucht');

    expect(sheets).toHaveLength(1);
    expect(sheets[0].sheetName).toBe('Lucht');
    expect(sheets[0].columns.map(c => c.jsonPath)).toEqual(['/observedProperty', '/hasResult/numericValue', '/hasResult/hasUnit']);
  });

  it('array columns get their own tab', () => {
    const splitter = new SheetSplitter();
    const columns = [
      col('/observedProperty'),
      col('/hasResult/numericValue'),
      col('/onttrekking/volume', { parentArray: '/onttrekking' }),
      col('/onttrekking/periode', { parentArray: '/onttrekking' }),
    ];

    const sheets = splitter.split(columns, 'Lucht');

    expect(sheets).toHaveLength(2);
    expect(sheets[0].sheetName).toBe('Lucht');
    expect(sheets[0].columns.map(c => c.jsonPath)).toContain('/observedProperty');
    expect(sheets[0].columns.map(c => c.jsonPath)).toContain('/hasResult/numericValue');

    const arraySheet = sheets[1];
    expect(arraySheet.parentPath).toBe('/onttrekking');
    expect(arraySheet.columns.map(c => c.jsonPath)).toEqual(['/onttrekking/volume', '/onttrekking/periode']);
  });

  it('a column whose parentArray is a nested path groups under the top-level segment', () => {
    const splitter = new SheetSplitter();
    const columns = [
      col('/observedProperty'),
      col('/meting/parameter/value', { parentArray: '/meting/parameter' }),
    ];

    const sheets = splitter.split(columns, 'Meten');

    expect(sheets).toHaveLength(2);
    expect(sheets[0].sheetName).toBe('Meten');

    const nestedSheet = sheets.find(s => s.parentPath === '/meting');
    expect(nestedSheet).toBeDefined();
    expect(nestedSheet!.parentPath).toBe('/meting');
    expect(nestedSheet!.columns.map(c => c.jsonPath)).toContain('/meting/parameter/value');
  });
});
