import { describe, it, expect } from 'vitest';
import { sortColumnsByUiOrder } from '../src/services/ui-sort.js';
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

describe('sortColumnsByUiOrder', () => {
  it('returns a single column unchanged', () => {
    const c = col('/foo');
    expect(sortColumnsByUiOrder([c])).toEqual([c]);
  });

  it('moves uiFirst column to the front', () => {
    const cols = [
      col('/b', { xUiFirst: true }),
      col('/a'),
      col('/c'),
    ];
    const sorted = sortColumnsByUiOrder(cols);
    expect(sorted.map(c => c.jsonPath)).toEqual(['/b', '/a', '/c']);
  });

  it('topologically sorts a uiAfter chain using bare property names', () => {
    const cols = [
      col('/a', { xUiFirst: true }),
      col('/c', { xUiAfter: 'b' }),
      col('/b', { xUiAfter: 'a' }),
      col('/d', { xUiAfter: 'c' }),
    ];
    const sorted = sortColumnsByUiOrder(cols);
    expect(sorted.map(c => c.jsonPath)).toEqual(['/a', '/b', '/c', '/d']);
  });

  it('resolves uiAfter via jsonPath with leading slash', () => {
    const cols = [
      col('/x'),
      col('/y', { xUiAfter: '/x' }),
      col('/z', { xUiAfter: '/y' }),
    ];
    const sorted = sortColumnsByUiOrder(cols);
    expect(sorted.map(c => c.jsonPath)).toEqual(['/x', '/y', '/z']);
  });

  it('resolves uiAfter via column title', () => {
    const cols = [
      col('/first', { title: 'Eerste' }),
      col('/second', { title: 'Tweede', xUiAfter: 'Eerste' }),
    ];
    const sorted = sortColumnsByUiOrder(cols);
    expect(sorted.map(c => c.jsonPath)).toEqual(['/first', '/second']);
  });

  it('keeps unconstrained columns in original order after ordered ones', () => {
    const cols = [
      col('/a'),
      col('/c', { xUiAfter: 'b' }),
      col('/b', { xUiAfter: 'a' }),
      col('/free'),
    ];
    const sorted = sortColumnsByUiOrder(cols);
    expect(sorted.map(c => c.jsonPath)).toEqual(['/a', '/b', '/c', '/free']);
  });

  it('drops uiAfter refs that do not resolve to any column', () => {
    const cols = [
      col('/a'),
      col('/b', { xUiAfter: 'missing' }),
      col('/c'),
    ];
    const sorted = sortColumnsByUiOrder(cols);
    expect(sorted.map(c => c.jsonPath)).toEqual(['/a', '/b', '/c']);
  });

  it('handles circular uiAfter dependencies without crashing', () => {
    const cols = [
      col('/a', { xUiAfter: 'b' }),
      col('/b', { xUiAfter: 'a' }),
    ];
    const sorted = sortColumnsByUiOrder(cols);
    expect(sorted).toHaveLength(2);
  });

  it('supports the uiFirst/uiAfter (non-x) aliases', () => {
    const cols = [
      col('/a', { uiAfter: 'b' }),
      col('/b', { uiFirst: true }),
    ];
    const sorted = sortColumnsByUiOrder(cols);
    expect(sorted.map(c => c.jsonPath)).toEqual(['/b', '/a']);
  });
});
