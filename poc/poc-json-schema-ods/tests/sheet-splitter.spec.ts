import { describe, expect, it } from 'vitest';
import { array, object, plan, text } from './fixtures.js';

describe('Derived worksheet boundaries', () => {
  it('inlines singleton entities, creates one sheet at every repeated depth and retains empty parents', () => {
    const result = plan(object({
      reports: array(object({
        sample: object({ sampling: object({ time: text }) }),
        results: array(object({ value: text })),
      }), 'Monsters'),
      empty: array(object({}), 'Lege records'),
    }));
    expect(result.records.map(record => record.sheetName)).toEqual(['Voorblad', 'Monsters', 'results', 'Lege records']);
    expect(result.records[1].columns[0].path).toEqual(['sample', 'sampling', 'time']);
    expect(result.records[2].parentId).toBe(result.records[1].id);
    expect(result.records[3].columns).toEqual([]);
  });

  it('sanitizes and collision-resolves names mechanically, including reserved cover/lookup names', () => {
    const result = plan(object({
      a: array(object({}), 'Voorblad'), b: array(object({}), 'voorblad'),
      c: array(object({}), 'A/B:*?[]'), d: array(object({}), 'A/B:*?[]'),
      e: array(object({}), 'x'.repeat(80)),
    }));
    const names = result.records.map(record => record.sheetName);
    expect(new Set(names.map(name => name.toLowerCase())).size).toBe(names.length);
    expect(names.every(name => name.length <= 31 && !/[\[\]:*?/\\]/.test(name))).toBe(true);
  });
});
