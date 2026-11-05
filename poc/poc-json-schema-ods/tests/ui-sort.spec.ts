import { describe, expect, it } from 'vitest';
import { object, plan, text } from './fixtures.js';

describe('Source-derived sibling order', () => {
  it('orders sibling groups before flattening and never matches ordering by translated label', () => {
    const result = plan(object({
      last: { ...text, title: 'First-looking label', 'x-ui-after': 'group' },
      group: object({ b: { ...text, 'x-ui-after': 'a' }, a: text }),
      first: { ...text, 'x-ui-first': true },
    }));
    expect(result.records[0].columns.map(column => column.path.join('/'))).toEqual(['first', 'group/a', 'group/b', 'last']);
  });

  it('diagnoses cycles and unresolved sibling references', () => {
    expect(() => plan(object({ a: { ...text, 'x-ui-after': 'b' }, b: { ...text, 'x-ui-after': 'a' } }))).toThrow(/Cyclic/);
    expect(() => plan(object({ a: { ...text, 'x-ui-after': 'translated label' } }))).toThrow(/Unresolved/);
  });
});
